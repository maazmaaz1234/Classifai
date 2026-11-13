// Small helpers shared across the app.

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export const uid = (prefix = "id") =>
  `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;

export const pct = (v, digits = 0) => `${(v * 100).toFixed(digits)}%`;

export const initials = (name = "") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("") || "?";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function tenureYears(iso, now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(0, (now - d) / (365.25 * 24 * 3600 * 1000));
}

export function tenureText(iso, now = new Date()) {
  const years = tenureYears(iso, now);
  const totalMonths = Math.floor(years * 12);
  const y = Math.floor(totalMonths / 12);
  const m = totalMonths % 12;
  if (y === 0) return `${m} ${m === 1 ? "month" : "months"}`;
  if (m === 0) return `${y} ${y === 1 ? "year" : "years"}`;
  return `${y} ${y === 1 ? "yr" : "yrs"} ${m} ${m === 1 ? "mo" : "mos"}`;
}

export function isoFromYearsAgo(years, now = new Date()) {
  const d = new Date(now.getTime() - years * 365.25 * 24 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

// Stable hue for a string (used to tint each customer card differently).
export function hashHue(str = "") {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 360;
}

// Tints stay inside the red → rose → violet → ember family so every card belongs to the same scene.
const TINTS = [
  "#ff3b52", "#ff5a8a", "#d4388f", "#ff7a3d", "#e5262f", "#ff4d9e", "#ff2d6a", "#ff9a3d",
];
export function tintFor(key = "") {
  return TINTS[hashHue(key) % TINTS.length];
}

export const riskTier = (p) => (p >= 0.5 ? "high" : p >= 0.3 ? "medium" : "low");
export const tierLabel = { high: "Likely to churn", medium: "At risk", low: "Likely to stay" };
export const riskColor = (p) => (p >= 0.5 ? "#ff4d5e" : p >= 0.3 ? "#ffb03d" : "#6ee7b7");

// Money is shown in rupees, with Indian digit grouping (₹12,34,567). Change CURRENCY / LOCALE here to switch everywhere at once.
export const CURRENCY = "₹";
const LOCALE = "en-IN";
export const money = (v, digits = 0) =>
  `${CURRENCY}${Number(v || 0).toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

// ── dates of birth / age ──
export function ageFromDob(iso, now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}
// Only an age is known: pick a stable day that makes that age true.
export function dobFromAge(age, seed = "", now = new Date()) {
  const d = new Date(Date.UTC(now.getFullYear() - age - 1, 0, 1) + (hashHue(seed) + 30) * 86400000);
  return d.toISOString().slice(0, 10);
}
export const tenureMonths = (iso, now = new Date()) => Math.floor(tenureYears(iso, now) * 12 + 1e-9);

export const GENDERS = [["male", "Male"], ["female", "Female"], ["other", "Other"]];
export const genderLabel = (g) => (GENDERS.find(([k]) => k === g) || [null, "Not given"])[1];

// Customer IDs look like CST-1042. nextCustomerId() keeps counting from the biggest one already in use.
export function nextCustomerId(list = []) {
  let max = 1000;
  list.forEach((c) => { const m = /(\d+)\s*$/.exec(c.customerId || ""); if (m) max = Math.max(max, +m[1]); });
  return `CST-${max + 1}`;
}

export function plural(n, one, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

// "#ff3b52" + 0.5 → "rgba(255, 59, 82, 0.5)"
export function withAlpha(hex, a = 1) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
