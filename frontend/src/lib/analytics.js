// Numbers behind the dashboard graphs. Everything is computed from the saved customers,
// so the charts always match the list next to them.
import { cumulativeLeave, featuresOf, isSenior, monthsWith, reasonsFor, revenueAtRisk } from "./predict";

export const HIGH = 0.5;

export function monthLabels(count = 13, now = new Date()) {
  return Array.from({ length: count }, (_, i) => {
    if (i === 0) return "Now";
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return d.toLocaleString("en", { month: "short" }) + (d.getMonth() === 0 ? ` ’${String(d.getFullYear()).slice(2)}` : "");
  });
}

// expected number of customers who have churned by month m (0…12)
export function expectedLeavers(list, months = 12) {
  return Array.from({ length: months + 1 }, (_, m) => list.reduce((s, c) => s + cumulativeLeave(c.risk, m), 0));
}

// ── segments: the ways customers can be grouped on the dashboard ──
export const TENURE_BANDS = [
  { id: "new", label: "Under 1 year", test: (m) => m < 12 },
  { id: "y1", label: "1–2 years", test: (m) => m >= 12 && m < 24 },
  { id: "y2", label: "2–4 years", test: (m) => m >= 24 && m < 48 },
  { id: "y4", label: "4+ years", test: (m) => m >= 48 },
];

export const DIMENSIONS = {
  contract: { label: "Contract", values: ["Month-to-month", "One year", "Two year"], of: (c) => featuresOf(c).contract },
  internet: { label: "Internet plan", values: ["Fiber optic", "DSL", "No"], of: (c) => featuresOf(c).internet, valueLabel: (v) => (v === "No" ? "No internet" : v) },
  tenure: { label: "Time with us", values: TENURE_BANDS.map((b) => b.label), of: (c) => TENURE_BANDS.find((b) => b.test(monthsWith(c))).label },
  payment: { label: "Payment", values: ["Electronic check", "Mailed check", "Bank transfer (automatic)", "Credit card (automatic)"], of: (c) => featuresOf(c).payment },
};

// Keeps customers that match every chosen filter: filter = { contract: [...], internet: [...], ... } (empty / missing = all).
export function applyFilter(list, filter) {
  if (!filter) return list;
  const keys = Object.keys(filter).filter((k) => filter[k] && filter[k].length);
  if (!keys.length) return list;
  return list.filter((c) => keys.every((k) => filter[k].includes(DIMENSIONS[k].of(c))));
}
export const filterIsEmpty = (filter) => !filter || !Object.values(filter).some((v) => v && v.length);

export function filterLabel(filter) {
  if (filterIsEmpty(filter)) return "All customers";
  const parts = [];
  Object.keys(filter).forEach((k) => {
    const vals = filter[k];
    if (!vals || !vals.length) return;
    const vl = DIMENSIONS[k].valueLabel || ((v) => v);
    parts.push(vals.length <= 2 ? vals.map(vl).join(" + ") : `${vals.length} ${DIMENSIONS[k].label.toLowerCase()} groups`);
  });
  return parts.join(" · ");
}

export function leaversBySegment(list, dimension = "contract", months = 12, max = 4) {
  const dim = DIMENSIONS[dimension];
  const groups = {};
  list.forEach((c) => { (groups[dim.of(c)] ||= []).push(c); });
  return Object.entries(groups)
    .map(([name, people]) => ({ name: (dim.valueLabel || ((v) => v))(name), people, total: expectedLeavers(people, months) }))
    .sort((a, b) => b.total[months] - a.total[months])
    .slice(0, max);
}

// average risk by how long customers have been with us
export function riskByTenure(list) {
  return TENURE_BANDS.map((b) => {
    const g = list.filter((c) => b.test(monthsWith(c)));
    return g.length ? g.reduce((s, c) => s + c.risk, 0) / g.length : 0;
  });
}

export function summary(list) {
  const n = list.length;
  const avg = n ? list.reduce((s, c) => s + c.risk, 0) / n : 0;
  const high = list.filter((c) => c.risk >= HIGH);
  const expected = list.reduce((s, c) => s + c.risk, 0);
  const revenue = list.reduce((s, c) => s + featuresOf(c).monthly * 12, 0);        // what they pay in a year
  const atRisk = list.reduce((s, c) => s + revenueAtRisk(c), 0);                    // …weighted by the chance they go
  const seniors = list.filter(isSenior).length;
  return { n, avg, high, expected, revenue, atRisk, seniors };
}

// Customers grouped by risk tier (for the donut / stacked bar)
export function tierCounts(list) {
  const low = list.filter((c) => c.risk < 0.3).length;
  const high = list.filter((c) => c.risk >= HIGH).length;
  return { low, medium: list.length - low - high, high };
}

// What is pushing customers toward leaving: for the customers who are likely to churn (or the riskiest quarter when
// nobody is above 50%), how many of them carry each reason.
export function topDrivers(list, max = 5) {
  if (!list.length) return { drivers: [], basis: 0, label: "" };
  let group = list.filter((c) => c.risk >= HIGH);
  let label = "customers likely to churn";
  if (group.length < 3) {
    group = [...list].sort((a, b) => b.risk - a.risk).slice(0, Math.max(3, Math.ceil(list.length / 4)));
    label = "the riskiest customers";
  }
  const tally = new Map();
  group.forEach((c) => {
    reasonsFor(c).forEach((r) => {
      if (typeof r.impact !== "number" || r.impact < 0.3) return;
      const cur = tally.get(r.key) || { key: r.key, label: r.label, count: 0 };
      cur.count += 1;
      tally.set(r.key, cur);
    });
  });
  const drivers = [...tally.values()].sort((a, b) => b.count - a.count).slice(0, max).map((d) => ({ ...d, share: d.count / group.length }));
  return { drivers, basis: group.length, label };
}
