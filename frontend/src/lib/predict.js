// ─────────────────────────────────────────────────────────────────────────────
// Churn scoring (customers who cancel a subscription or stop using the product)
//
// 1. predictBatch() first tries your Python back end, where the trained SVM (support vector machine) lives:
//        POST  {API}/predict   body: { customers: [ {tenure, Contract, MonthlyCharges, ...}, ... ] }
//        reply { predictions: [ { probability: 0.37, decision?: 0.81, reasons?: [...] }, ... ] }
//    The column names that are sent are built in toModelRow() below. Edit that one function so they match the
//    columns your SVM was trained on. (backend/app.py in this project already speaks this format.)
//
// 2. If the back end isn't running, a transparent rule-based demo scorer is used so the dashboard still works.
//    Every customer remembers where its score came from (`source: "api"` or `source: "demo"`) and the screens say so.
// ─────────────────────────────────────────────────────────────────────────────
import { ageFromDob, clamp, tenureMonths } from "./format";

const API =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_URL) || "/api";

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

export const CONTRACTS = ["Month-to-month", "One year", "Two year"];
export const INTERNET = ["Fiber optic", "DSL", "No"];
export const PAYMENTS = ["Electronic check", "Mailed check", "Bank transfer (automatic)", "Credit card (automatic)"];

// What a customer needs to carry so the model can score them. Used as defaults when a field is missing.
export const DEFAULT_FEATURES = {
  senior: false, partner: false, dependents: false,
  phoneService: true, multipleLines: false,
  internet: "DSL",
  onlineSecurity: false, onlineBackup: false, deviceProtection: false, techSupport: false, streamingTV: false, streamingMovies: false,
  contract: "Month-to-month", paperless: true, payment: "Electronic check",
  monthly: 65, total: undefined,
};

export const featuresOf = (c) => ({ ...DEFAULT_FEATURES, ...(c.features || {}) });
export const monthsWith = (c, now = new Date()) => tenureMonths(c.joined, now);
export const isSenior = (c) => {
  const a = c.dob ? ageFromDob(c.dob) : null;
  return a !== null ? a >= 65 : !!(c.features && c.features.senior);
};
export const totalCharges = (c) => {
  const f = featuresOf(c);
  return f.total !== undefined && f.total !== null && f.total !== "" ? Number(f.total) : Math.round(f.monthly * Math.max(1, monthsWith(c)) * 100) / 100;
};
export const hasInternet = (f) => f.internet && f.internet !== "No";

// ── Demo scorer ──────────────────────────────────────────────────────────────
// Each rule adds (or removes) "log-odds", the same kind of signal an SVM's decision function gives.
// The biggest contributions become the human-readable reasons shown on the dashboard.
export function scoreLocal(c, now = new Date()) {
  const f = featuresOf(c);
  const months = monthsWith(c, now);
  const senior = isSenior(c);
  const net = hasInternet(f);

  const parts = [];
  const add = (key, label, detail, impact) => parts.push({ key, label, detail, impact });

  if (f.contract === "Month-to-month") add("contract", "Month-to-month contract", "No commitment: the customer can cancel any month. This is the strongest churn signal.", 1.2);
  else if (f.contract === "One year") add("contract", "One-year contract", "Committed for a year, so churn is much less likely.", -0.45);
  else add("contract", "Two-year contract", "Committed for two years: the most loyal group.", -1.15);

  if (months < 6) add("tenure", "Brand-new customer", `Only ${months} ${months === 1 ? "month" : "months"} with the service. The first months are when most customers leave.`, 1.0);
  else if (months < 12) add("tenure", "Less than a year in", `${months} months with the service.`, 0.65);
  else if (months < 24) add("tenure", "Still early", `${months} months with the service.`, 0.2);
  else if (months >= 60) add("tenure", "Long-standing customer", `${Math.floor(months / 12)} years with the service.`, -0.95);
  else if (months >= 36) add("tenure", "Established customer", `${Math.floor(months / 12)} years with the service.`, -0.6);

  if (f.internet === "Fiber optic") add("internet", "Fiber optic plan", "Fiber customers churn more often, usually over price or reliability.", 0.75);
  else if (f.internet === "No") add("internet", "No internet service", "Phone-only customers are among the most stable.", -0.85);
  else add("internet", "DSL plan", "DSL customers churn less than fiber customers.", -0.1);

  if (f.monthly >= 95) add("charges", "Very high monthly bill", `Pays ${Math.round(f.monthly)} a month, well above the typical bill.`, 0.55);
  else if (f.monthly >= 75) add("charges", "High monthly bill", `Pays ${Math.round(f.monthly)} a month.`, 0.3);
  else if (f.monthly < 30) add("charges", "Low monthly bill", `Pays ${Math.round(f.monthly)} a month.`, -0.5);
  else if (f.monthly < 50) add("charges", "Modest monthly bill", `Pays ${Math.round(f.monthly)} a month.`, -0.2);

  if (f.payment === "Electronic check") add("payment", "Pays by electronic check", "The highest-churn payment method: no automatic payment to keep them attached.", 0.7);
  else if (f.payment === "Mailed check") add("payment", "Pays by mailed check", "A manual payment each month.", 0.0);
  else add("payment", "Automatic payments", "Bank or card auto-pay keeps customers attached.", -0.4);

  if (net) {
    if (!f.techSupport) add("support", "No tech support", "Customers without tech support leave more often when something goes wrong.", 0.6);
    else add("support", "Has tech support", "Support add-on lowers churn.", -0.45);

    if (!f.onlineSecurity) add("security", "No online security", "Customers without the security add-on churn more.", 0.5);
    else add("security", "Has online security", "The security add-on lowers churn.", -0.4);

    if (!f.onlineBackup && !f.deviceProtection) add("protection", "No backup or device protection", "Fewer add-ons means fewer reasons to stay.", 0.2);
    else if (f.onlineBackup && f.deviceProtection) add("protection", "Backup and device protection", "Several add-ons make switching harder.", -0.25);
  }

  if (f.paperless && f.payment !== "Credit card (automatic)" && f.payment !== "Bank transfer (automatic)") add("billing", "Paperless, manual payment", "Paperless bills with manual payment are easy to ignore, and easy to cancel.", 0.2);

  if (senior) add("senior", "Senior citizen", "Senior customers churn somewhat more often.", 0.4);

  if (!f.partner && !f.dependents) add("household", "Lives alone", "Single-person households churn more than families.", 0.25);
  else if (f.dependents) add("household", "Has dependants", "Families tend to stay.", -0.3);

  const logit = -2.6 + parts.reduce((s, p) => s + p.impact, 0);
  const risk = clamp(sigmoid(logit), 0.01, 0.99);
  const reasons = parts
    .filter((p) => Math.abs(p.impact) >= 0.15)
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
    .slice(0, 8)
    .map((p) => ({ ...p, impact: Math.round(p.impact * 100) / 100 }));
  return { risk, reasons, decision: Math.round(logit * 100) / 100 };
}

// Reasons are not saved with every customer (that would fill the browser's storage). They are worked out when needed,
// unless the back end sent its own.
const reasonCache = new WeakMap();
export function reasonsFor(c) {
  if (c.reasons && c.reasons.length) return c.reasons;
  let r = reasonCache.get(c);
  if (!r) { r = scoreLocal(c).reasons; reasonCache.set(c, r); }
  return r;
}

// ── Back-end adapter ─────────────────────────────────────────────────────────
// EDIT HERE to match the columns your trained SVM expects (the Telco-churn column names are shown).
export function toModelRow(c) {
  const f = featuresOf(c);
  const net = hasInternet(f);
  const yn = (v) => (v ? "Yes" : "No");
  const addon = (v) => (net ? yn(v) : "No internet service");
  return {
    customerID: c.customerId,
    gender: c.gender === "male" ? "Male" : "Female",          // Telco has Male / Female only
    SeniorCitizen: isSenior(c) ? 1 : 0,
    Partner: yn(f.partner),
    Dependents: yn(f.dependents),
    tenure: monthsWith(c),                                     // months
    PhoneService: yn(f.phoneService),
    MultipleLines: f.phoneService ? yn(f.multipleLines) : "No phone service",
    InternetService: f.internet,
    OnlineSecurity: addon(f.onlineSecurity),
    OnlineBackup: addon(f.onlineBackup),
    DeviceProtection: addon(f.deviceProtection),
    TechSupport: addon(f.techSupport),
    StreamingTV: addon(f.streamingTV),
    StreamingMovies: addon(f.streamingMovies),
    Contract: f.contract,
    PaperlessBilling: yn(f.paperless),
    PaymentMethod: f.payment,
    MonthlyCharges: f.monthly,
    TotalCharges: totalCharges(c),
  };
}

let apiDownUntil = 0;
// Called after a (new) sign-in: the model server may have said "please sign in" before, which must not count as "server is off".
export const resetPredictCooldown = () => { apiDownUntil = 0; };

// Customers are scored in small groups, so even a slow computer answers each request quickly and a big CSV never hits
// one long timeout. onProgress(done, total) lets the screen show how far it is.
const CHUNK = 250;
const CHUNK_TIMEOUT = 60_000;

async function scoreChunk(list) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CHUNK_TIMEOUT);
  try {
    const res = await fetch(`${API}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customers: list.map(toModelRow) }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const preds = Array.isArray(data) ? data : data.predictions;
    if (!Array.isArray(preds) || preds.length !== list.length) throw new Error("Unexpected reply");
    return list.map((c, i) => {
      const p = preds[i];
      const prob = typeof p === "number" ? p : p.probability ?? p.churn_probability ?? p.risk;
      if (typeof prob !== "number") throw new Error("Missing probability");
      const out = { risk: clamp(prob, 0.01, 0.99), source: "api" };
      if (p && typeof p === "object") {
        const d = p.decision ?? p.decision_function;
        if (typeof d === "number") out.decision = d;
        if (Array.isArray(p.reasons) && p.reasons.length) out.reasons = p.reasons;
      }
      return out;
    });
  } finally { clearTimeout(timer); }
}

export async function predictBatch(customers, onProgress) {
  const demoFor = (list) => list.map((c) => { const s = scoreLocal(c); return { risk: s.risk, decision: s.decision, source: "demo" }; });
  if (Date.now() < apiDownUntil || customers.length === 0) return demoFor(customers);
  const out = [];
  for (let i = 0; i < customers.length; i += CHUNK) {
    const part = customers.slice(i, i + CHUNK);
    try {
      out.push(...(await scoreChunk(part)));
    } catch {
      if (i === 0) apiDownUntil = Date.now() + 60_000;                 // the very first group failed: the server is off, do not hammer it
      out.push(...demoFor(customers.slice(i)));                         // keep what the model already scored; the rest falls back to the demo scorer
      break;
    }
    onProgress?.(Math.min(i + CHUNK, customers.length), customers.length);
  }
  return out;
}

export const apiBase = API;

// ── Forecast helpers (used by the dashboard graphs) ──────────────────────────
// `risk` is the chance of churning within 12 months. This spreads it across the 12 months:
// high-risk customers tend to leave sooner (front-loaded), low-risk later.
export const forecastShape = (risk) => (risk >= 0.5 ? 0.75 : risk >= 0.3 ? 0.9 : 1.15);

export function cumulativeLeave(risk, month) {
  return risk * Math.pow(clamp(month / 12, 0, 1), forecastShape(risk));
}

export function expectedChurnMonth(risk) {
  // Month where half of the 12-month probability has been reached.
  return Math.max(1, Math.round(12 * Math.pow(0.5, 1 / forecastShape(risk))));
}

// What the customer would pay over the next 12 months, weighted by how likely they are to go.
export const revenueAtRisk = (c) => c.risk * featuresOf(c).monthly * 12;

// The retention play for each reason (shown under the top reason on a customer's page).
export const ACTIONS = {
  contract: "Offer a discount or free add-on to move them onto a one- or two-year contract.",
  tenure: "Call in the first weeks: a welcome check-in and a named contact reduce early churn.",
  internet: "Check the line quality for this customer and offer a speed or price review.",
  charges: "Review the plan against what they actually use, and offer a cheaper bundle.",
  payment: "Nudge them to automatic payments with a small bill credit.",
  support: "Add tech support free for three months and see if they keep it.",
  security: "Offer online security as a free trial.",
  protection: "Bundle backup and device protection at a low price.",
  billing: "Send a friendly bill reminder and offer auto-pay.",
  senior: "Offer a simple plan with phone support and a dedicated contact.",
  household: "Offer a family or multi-line plan that rewards staying.",
};
