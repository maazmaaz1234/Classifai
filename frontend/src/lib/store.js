// Tiny global store (no extra library). The customers of the signed-in account live in the database on the server
// (backend/classifai.db); this keeps a copy in memory so every page updates at once.
import { useSyncExternalStore } from "react";
import { predictBatch } from "./predict";
import { buildCustomer } from "./customer";
import { makeSample } from "./sample";
import { nextCustomerId } from "./format";
import { api } from "./api";
import { toast } from "./toast";

let state = { customers: [] };
const listeners = new Set();

function set(next) {
  state = next;
  listeners.forEach((l) => l());
}

// Called when someone signs in (with that account's customers from the server) and when they sign out (empty workspace).
export function setCustomers(customers) {
  set({ customers: Array.isArray(customers) ? customers : [] });
}
export async function fetchCustomers() {
  const { customers } = await api("/customers");
  return customers || [];
}

// A big CSV is sent to the database in pieces so no single request is huge.
async function saveInChunks(list, size = 500) {
  for (let i = 0; i < list.length; i += size) await api("/customers", { method: "POST", body: { customers: list.slice(i, i + size) } });
}

const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
export const useData = () => useSyncExternalStore(subscribe, () => state);
export const getData = () => state;
export const getCustomer = (id) => state.customers.find((c) => c.id === id) || null;

// A record as it is saved: the scored result is merged onto it. Reasons are only kept when the back end sent them.
const scored = (c, s) => {
  const out = { ...c, risk: s.risk, source: s.source };
  if (s.decision !== undefined) out.decision = s.decision; else delete out.decision;
  if (s.reasons) out.reasons = s.reasons; else delete out.reasons;
  return out;
};

export const actions = {
  // list = customer inputs (the add form or a CSV). Every one gets a unique customer ID, a default picture and a churn score.
  async addCustomers(list, onProgress) {
    const built = [];
    const taken = new Set(state.customers.map((c) => c.customerId.toLowerCase()));
    list.forEach((input) => {
      let customerId = String(input.customerId || "").trim();
      if (!customerId || taken.has(customerId.toLowerCase())) customerId = nextCustomerId([...state.customers, ...built]);
      taken.add(customerId.toLowerCase());
      built.push(buildCustomer({ ...input, customerId }, [...state.customers, ...built]));
    });
    const scores = await predictBatch(built, onProgress);
    const added = built.map((c, i) => scored(c, scores[i]));
    await saveInChunks(added);
    set({ ...state, customers: [...state.customers, ...added] });
    return added;
  },

  // Saves changes to one customer and scores them again.
  async updateCustomer(id, input) {
    const old = getCustomer(id);
    if (!old) return null;
    const next = buildCustomer({ ...old, ...input, id, createdAt: old.createdAt, avatar: input.avatar ?? old.avatar }, state.customers.filter((c) => c.id !== id));
    const [s] = await predictBatch([next]);
    const saved = scored(next, s);
    await api(`/customers/${encodeURIComponent(id)}`, { method: "PUT", body: saved });
    set({ ...state, customers: state.customers.map((c) => (c.id === id ? saved : c)) });
    return saved;
  },

  // Disappears from the screen at once; the database is told in the background (and the list comes back if that fails).
  removeCustomer(id) {
    const before = state;
    set({ ...state, customers: state.customers.filter((c) => c.id !== id) });
    api(`/customers/${encodeURIComponent(id)}`, { method: "DELETE" }).catch((err) => { set(before); toast(err.message || "Could not remove that customer.", "error"); });
  },

  async loadSample() {
    const sample = makeSample(state.customers);
    try {
      await saveInChunks(sample);
      set({ ...state, customers: [...state.customers, ...sample] });
    } catch (err) { toast(err.message || "Could not add the sample customers.", "error"); }
  },
};

// Shrinks an uploaded picture so it stays small in the database. square = crop to the middle square (profile pictures).
export function readImage(file, max = 720, square = false) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file is not a valid image."));
      img.onload = () => {
        const c = document.createElement("canvas");
        if (square) {
          const side = Math.min(img.width, img.height);
          const out = Math.min(max, side);
          c.width = out; c.height = out;
          c.getContext("2d").drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, out, out);
        } else {
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          c.width = Math.round(img.width * scale);
          c.height = Math.round(img.height * scale);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        }
        resolve(c.toDataURL("image/jpeg", 0.84));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ── what the Dashboard is currently looking at (shared so other pages can deep-link to it) ──
let selection = { filter: {}, customerId: null };   // filter = { contract: [...], internet: [...], ... }, empty = all customers
const selListeners = new Set();
const selSubscribe = (l) => { selListeners.add(l); return () => selListeners.delete(l); };
const setSelection = (next) => { selection = next; selListeners.forEach((l) => l()); };

export const useSelection = () => useSyncExternalStore(selSubscribe, () => selection);
export const selectionActions = {
  setFilter: (filter) => setSelection({ filter, customerId: null }),
  setCustomer: (customerId) => setSelection({ ...selection, customerId }),
  // jump straight to one customer (used by the "Open analytics" buttons)
  openCustomer: (customerId) => setSelection({ filter: {}, customerId }),
};
