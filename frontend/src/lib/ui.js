// Small shared UI state: which customer's page is open, and which "scene" the ribbon background should show
// while a window or the full-screen chat is open (so opening them visibly changes the background).
import { useSyncExternalStore } from "react";

let state = { profile: null, scenes: [] };   // profile = { id, edit } | null · scenes = stack of names, last one wins
const listeners = new Set();
const set = (next) => { state = next; listeners.forEach((l) => l()); };
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };

export const useUI = () => useSyncExternalStore(subscribe, () => state);
export const getUI = () => state;

export const ui = {
  openProfile: (id, edit = false) => set({ ...state, profile: { id, edit } }),
  closeProfile: () => set({ ...state, profile: null }),
  // pushScene("customers") returns a function that takes it off again (call it from an effect cleanup)
  pushScene(name) {
    const entry = { name };
    set({ ...state, scenes: [...state.scenes, entry] });
    return () => set({ ...state, scenes: state.scenes.filter((s) => s !== entry) });
  },
};

// holdPage() hides the page behind a window or the customer page (html[data-modal="true"]) and returns the release function.
// A counter, so closing the top window never un-hides the page while another window is still open underneath.
let held = 0;
ui.holdPage = () => {
  held += 1;
  document.documentElement.dataset.modal = "true";
  let done = false;
  return () => {
    if (done) return;
    done = true;
    held = Math.max(0, held - 1);
    if (held === 0) document.documentElement.dataset.modal = "false";
  };
};

export const topScene = (s = state) => (s.scenes.length ? s.scenes[s.scenes.length - 1].name : null);

// Values the ribbon background reads every frame (plain object, no React): other code nudges these and the
// background eases toward them.
//   shift  −1…1  slides the whole ribbon sideways (the carousel sets it to follow the active card)
//   speed  0…3   extra flow speed on top of the normal pace (the sign-in surge, a spoken answer)
//   level  0…1   extra brightness and heat (Pandu talking)
export const fx = { shift: 0, speed: 0, level: 0 };
