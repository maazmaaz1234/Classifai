// Sign-in, backed by the Python server (backend/accounts.py). Accounts live in the database there: the password is
// hashed on the server and never stored or sent back, and the browser only holds an HttpOnly cookie that scripts cannot read.
import { useSyncExternalStore } from "react";
import { setCustomers, fetchCustomers } from "./store";
import { api, setSignedOutHandler } from "./api";
import { resetPredictCooldown } from "./predict";
import { defaultAvatarFor, isAvatarId } from "./avatars";

let session = null;
let booting = true;                       // true until the first "am I already signed in?" answer has arrived
const listeners = new Set();
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const emit = () => listeners.forEach((l) => l());

export const useSession = () => useSyncExternalStore(subscribe, () => session);
export const useAuthBooting = () => useSyncExternalStore(subscribe, () => booting);
export const getSession = () => session;

// The signed-in person as the rest of the app needs them. photo = an uploaded picture (data URL), avatar = one of the 22 defaults.
const publicUser = (u) => ({ name: u.name, email: u.email, photo: u.photo || null, avatar: isAvatarId(u.avatar) ? u.avatar : defaultAvatarFor(u.email) });

const setSession = (next) => { session = next; emit(); };

// ── the little "welcome in" animation that plays between a correct sign-in and the workspace ──
let phase = "idle";                       // "idle" | "entering"
const phaseListeners = new Set();
const setPhase = (p) => { phase = p; phaseListeners.forEach((l) => l()); };
export const useAuthPhase = () => useSyncExternalStore((l) => { phaseListeners.add(l); return () => phaseListeners.delete(l); }, () => phase);
const ENTER_MS = 1500;
const playEnter = () => new Promise((resolve) => {
  if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) { resolve(); return; }
  setPhase("entering");
  setTimeout(resolve, ENTER_MS);
});
const endEnter = () => { setPhase("idle"); try { document.documentElement.dataset.welcome = "true"; setTimeout(() => { document.documentElement.dataset.welcome = "false"; }, 1900); } catch { /* ignore */ } };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (v) => String(v || "").trim();
export const MIN_PASSWORD = 8;

// Brings that account's customers over from the database, then opens the workspace.
async function enter(user, { animate }) {
  const customers = await fetchCustomers();
  if (animate) await playEnter();
  resetPredictCooldown();
  setCustomers(customers);
  setSession(publicUser(user));
  if (animate) endEnter();
}

export async function signUp({ name, email, password, photo = null, avatar = null }) {
  name = clean(name); email = clean(email).toLowerCase();
  if (name.length < 2) throw new Error("Please enter your name.");
  if (!EMAIL.test(email)) throw new Error("That email address doesn't look right.");
  if (String(password || "").length < MIN_PASSWORD) throw new Error(`Use at least ${MIN_PASSWORD} characters for the password.`);
  const { user } = await api("/auth/signup", { method: "POST", body: { name, email, password, photo, avatar: isAvatarId(avatar) ? avatar : defaultAvatarFor(email) } });
  await enter(user, { animate: true });
}

export async function signIn({ email, password }) {
  email = clean(email).toLowerCase();
  if (!EMAIL.test(email)) throw new Error("That email address doesn't look right.");
  if (!password) throw new Error("Enter your password.");
  const { user } = await api("/auth/login", { method: "POST", body: { email, password } });
  await enter(user, { animate: true });
}

// On every page load: is this browser still signed in? (the cookie decides)
export async function restoreSession() {
  try {
    const { user } = await api("/auth/me", { quiet: true });
    await enter(user, { animate: false });
  } catch { /* not signed in, or the server is off: show the sign-in page */ }
  booting = false;
  emit();
}

// ── checks and changes for a signed-in person ──
// Used to guard deleting / editing customers: the same password they signed in with.
export async function verifyPassword(password) {
  if (!session || !password) return false;
  try { return (await api("/auth/verify", { method: "POST", body: { password } })).ok === true; } catch { return false; }
}

export async function updateProfile({ name, photo, avatar }) {
  if (!session) throw new Error("Sign in first.");
  const nm = clean(name);
  if (nm.length < 2) throw new Error("Please enter your name.");
  const body = { name: nm };
  if (photo !== undefined) body.photo = photo || null;
  if (avatar !== undefined && isAvatarId(avatar)) body.avatar = avatar;
  const { user } = await api("/auth/profile", { method: "PATCH", body });
  setSession(publicUser(user));
}

export async function changePassword(current, next) {
  if (!session) throw new Error("Sign in first.");
  if (String(next || "").length < MIN_PASSWORD) throw new Error(`Use at least ${MIN_PASSWORD} characters for the new password.`);
  await api("/auth/password", { method: "POST", body: { current, next } });
}

export function signOut() {
  api("/auth/logout", { method: "POST", quiet: true }).catch(() => {});
  setCustomers([]);
  setSession(null);
}

// If the server says the sign-in has ended (for example the password was changed on another device), go back to sign-in.
setSignedOutHandler(() => { if (session) { setCustomers([]); setSession(null); } });
