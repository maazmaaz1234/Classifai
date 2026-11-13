// Demo customers used by "Try with sample data" on an empty dashboard and to generate public/sample-customers.csv.
// Deterministic, so it looks the same every time. The mix (contracts, internet plans, tenure) follows the
// shape of the public Telco churn data, so the demo numbers look believable.
import { isoFromYearsAgo, uid } from "./format";
import { buildCustomer } from "./customer";
import { scoreLocal } from "./predict";

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MALE = ["Aarav", "Vihaan", "Aditya", "Arjun", "Rohan", "Karan", "Ishaan", "Kabir", "Nikhil", "Rahul", "Siddharth", "Varun", "Mohit", "Imran", "Farhan", "Harsh", "Yash", "Kiran", "Manish", "Deepak", "Suresh", "Ramesh", "Vikram", "Anil"];
const FEMALE = ["Anaya", "Diya", "Isha", "Kavya", "Meera", "Nisha", "Priya", "Riya", "Sana", "Tara", "Neha", "Pooja", "Ananya", "Aisha", "Zoya", "Tanvi", "Shreya", "Divya", "Sneha", "Ritu", "Lakshmi", "Sunita", "Fatima", "Rekha"];
const LAST = ["Sharma", "Verma", "Iyer", "Nair", "Reddy", "Patel", "Mehta", "Khan", "Gupta", "Singh", "Kapoor", "Joshi", "Das", "Bose", "Menon", "Rao", "Shah", "Malhotra", "Chopra", "Pillai", "Desai", "Kulkarni", "Bhat", "Ansari", "Saxena", "Agarwal", "Banerjee", "Thakur"];
const PLACES = [
  ["Bengaluru", "Karnataka", "5600"], ["Mysuru", "Karnataka", "5700"], ["Pune", "Maharashtra", "4110"], ["Mumbai", "Maharashtra", "4000"],
  ["New Delhi", "Delhi", "1100"], ["Hyderabad", "Telangana", "5000"], ["Chennai", "Tamil Nadu", "6000"], ["Kochi", "Kerala", "6820"],
  ["Jaipur", "Rajasthan", "3020"], ["Kolkata", "West Bengal", "7000"], ["Ahmedabad", "Gujarat", "3800"], ["Lucknow", "Uttar Pradesh", "2260"],
];
const STREETS = ["MG Road", "Gandhi Nagar", "Lake View Road", "Park Street", "Temple Road", "Station Road", "Residency Road", "Green Avenue", "Hill Side Lane", "Rose Garden Colony"];

const pick = (r, list) => list[Math.floor(r() * list.length)];
const chance = (r, p) => r() < p;

export function makeSampleCustomers(count, seed = 2024) {
  const r = rng(seed);
  const used = new Set();
  const list = [];
  for (let i = 0; i < count; i++) {
    const gender = chance(r, 0.5) ? "male" : "female";
    let name;
    do { name = `${pick(r, gender === "male" ? MALE : FEMALE)} ${pick(r, LAST)}`; } while (used.has(name) && used.size < 600);
    used.add(name);

    const age = Math.round(Math.min(84, Math.max(19, 44 + (r() + r() + r() - 1.5) * 34)));
    // tenure in months: lots of brand-new customers, a long tail, and a big loyal group at the top (like the Telco data)
    const u = r();
    const months = u < 0.3 ? 1 + Math.floor(r() * 8) : u < 0.78 ? 8 + Math.floor(r() * 52) : 60 + Math.floor(r() * 13);

    const contract = (() => {
      const p = r();
      if (months < 12) return p < 0.86 ? "Month-to-month" : p < 0.95 ? "One year" : "Two year";
      if (months < 36) return p < 0.5 ? "Month-to-month" : p < 0.78 ? "One year" : "Two year";
      return p < 0.25 ? "Month-to-month" : p < 0.5 ? "One year" : "Two year";
    })();
    const internet = (() => { const p = r(); return p < 0.44 ? "Fiber optic" : p < 0.78 ? "DSL" : "No"; })();
    const net = internet !== "No";
    const phoneService = chance(r, 0.9);
    const addon = (p) => net && chance(r, p);
    const onlineSecurity = addon(contract === "Month-to-month" ? 0.22 : 0.45);
    const techSupport = addon(contract === "Month-to-month" ? 0.22 : 0.45);
    const onlineBackup = addon(0.35);
    const deviceProtection = addon(0.35);
    const streamingTV = addon(0.4);
    const streamingMovies = addon(0.4);
    const multipleLines = phoneService && chance(r, 0.42);

    let monthly = internet === "Fiber optic" ? 70 + r() * 18 : internet === "DSL" ? 42 + r() * 16 : 18 + r() * 8;
    if (phoneService && net) monthly += 0; else if (!phoneService) monthly -= 8;
    if (multipleLines) monthly += 5;
    [onlineSecurity, onlineBackup, deviceProtection, techSupport].forEach((v) => { if (v) monthly += 5 + r() * 2; });
    [streamingTV, streamingMovies].forEach((v) => { if (v) monthly += 8 + r() * 2; });
    monthly = Math.round(Math.max(18.25, Math.min(118.75, monthly)) * 20) / 20;

    const payment = (() => {
      const p = r();
      if (contract === "Month-to-month") return p < 0.5 ? "Electronic check" : p < 0.68 ? "Mailed check" : p < 0.84 ? "Bank transfer (automatic)" : "Credit card (automatic)";
      return p < 0.14 ? "Electronic check" : p < 0.3 ? "Mailed check" : p < 0.65 ? "Bank transfer (automatic)" : "Credit card (automatic)";
    })();

    const partner = chance(r, 0.48);
    const dependents = chance(r, partner ? 0.4 : 0.15);
    const [city, state, pinPrefix] = pick(r, PLACES);
    const pin = pinPrefix + String(Math.floor(r() * 100)).padStart(2, "0");
    const slug = name.toLowerCase().replace(/[^a-z]+/g, ".");
    const total = Math.round(monthly * months * (0.96 + r() * 0.08) * 100) / 100;

    list.push({
      customerId: `CST-${1001 + i}`,
      name,
      gender,
      age,
      joined: isoFromYearsAgo(months / 12),
      phone: `+91 ${pick(r, ["98", "97", "96", "88", "79", "70"])}${String(Math.floor(r() * 1e8)).padStart(8, "0")}`,
      email: `${slug}${Math.floor(r() * 90 + 10)}@example.com`,
      address: `${Math.floor(r() * 180 + 4)}, ${pick(r, STREETS)}, ${city}, ${state} ${pin}`,
      idNumber: `ID${String(Math.floor(r() * 1e9)).padStart(9, "0")}`,
      features: {
        senior: age >= 65, partner, dependents, phoneService, multipleLines, internet,
        onlineSecurity, onlineBackup, deviceProtection, techSupport, streamingTV, streamingMovies,
        contract, paperless: chance(r, contract === "Month-to-month" ? 0.7 : 0.45), payment, monthly, total,
      },
    });
  }
  return list;
}

export function makeSample(existing = [], count = 120) {
  const made = [];
  makeSampleCustomers(count).forEach((c) => {
    const built = buildCustomer({ ...c, id: uid("cus") }, [...existing, ...made]);
    const s = scoreLocal(built);
    made.push({ ...built, risk: s.risk, decision: s.decision, source: "demo" });
  });
  // skip IDs the account already has
  const have = new Set(existing.map((c) => c.customerId));
  return made.filter((c) => !have.has(c.customerId));
}
