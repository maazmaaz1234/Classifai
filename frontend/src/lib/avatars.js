// The 22 default profile pictures (public/avatars/a01.webp … a22.webp), exactly as supplied.
// g: "m" male person · "f" female person · "x" animal that works for anyone
// (a lion with a mane is treated as male, a cow as female).
import { hashHue } from "./format";

export const AVATARS = [
  { id: "a01", name: "Bear", g: "x" },
  { id: "a02", name: "Cow", g: "f" },
  { id: "a03", name: "Pig", g: "x" },
  { id: "a04", name: "Owl", g: "x" },
  { id: "a05", name: "Lion", g: "m" },
  { id: "a06", name: "Cat", g: "x" },
  { id: "a07", name: "Elephant", g: "x" },
  { id: "a08", name: "Fox", g: "x" },
  { id: "a09", name: "Rabbit", g: "x" },
  { id: "a10", name: "Panda", g: "x" },
  { id: "a11", name: "Silver bob", g: "f" },
  { id: "a12", name: "Quiff", g: "m" },
  { id: "a13", name: "Long waves", g: "f" },
  { id: "a14", name: "Beard", g: "m" },
  { id: "a15", name: "Curls", g: "f" },
  { id: "a16", name: "Spikes", g: "m" },
  { id: "a17", name: "Bob cut", g: "f" },
  { id: "a18", name: "Ponytail", g: "f" },
  { id: "a19", name: "Silver hair", g: "m" },
  { id: "a20", name: "Curly boy", g: "m" },
  { id: "a21", name: "Hair clip", g: "f" },
  { id: "a22", name: "Green jumper", g: "m" },
];

const BY_ID = new Map(AVATARS.map((a) => [a.id, a]));
const BASE = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.BASE_URL) || "/";

export const avatarSrc = (id) => (BY_ID.has(id) ? `${BASE}avatars/${id}.webp` : null);
export const isAvatarId = (v) => BY_ID.has(v);

// Which avatars suit a gender: male → male people + animals, female → female people + animals, anything else → all 22.
export function avatarsFor(gender) {
  const g = gender === "male" ? "m" : gender === "female" ? "f" : null;
  if (!g) return AVATARS;
  return AVATARS.filter((a) => a.g === g || a.g === "x" || (a.g !== "m" && a.g !== "f"));
}

// A stable, varied default for somebody. Matching people are twice as likely as animals; with no gender every picture is in play.
export function defaultAvatarFor(seed = "", gender = "") {
  const g = gender === "male" ? "m" : gender === "female" ? "f" : null;
  const pool = [];
  AVATARS.forEach((a) => {
    if (!g) { pool.push(a.id); return; }
    if (a.g === g) pool.push(a.id, a.id);
    else if (a.g === "x") pool.push(a.id);
    // an avatar of the other gender is left out
  });
  // hashHue only has 360 values; mix in a second hash so every avatar gets picked.
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const n = (Math.abs(h) + hashHue(seed) * 7919) % pool.length;
  return pool[n];
}

// Does this avatar still fit this gender? (used after someone edits the gender)
export function avatarFits(id, gender) {
  const a = BY_ID.get(id);
  if (!a) return false;
  const g = gender === "male" ? "m" : gender === "female" ? "f" : null;
  return !g || a.g === g || a.g === "x";
}
