// Minimal, forgiving CSV reader + a column mapper that understands our own template and the
// public Telco-churn column names (customerID, SeniorCitizen, tenure, Contract, MonthlyCharges, ...).
import { isoFromYearsAgo } from "./format";
import { CONTRACTS, INTERNET, PAYMENTS } from "./predict";

export function parseCSV(text) {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] || "";
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let q = false;
  for (const ch of firstLine) {
    if (ch === '"') q = !q;
    else if (!q && ch in counts) counts[ch]++;
  }
  const delim = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];

  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => h.trim());
  const body = rows.slice(1).map((r) => {
    const o = {};
    headers.forEach((h, i) => { o[h] = (r[i] ?? "").trim(); });
    return o;
  });
  return { headers, rows: body };
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// canonical field → accepted header spellings (normalised)
const ALIASES = {
  name: ["name", "customername", "fullname", "customer"],
  firstName: ["firstname", "first"],
  lastName: ["lastname", "last", "surname"],
  customerId: ["customerid", "customerno", "customernumber", "id", "custid", "accountid", "accountnumber"],
  gender: ["gender", "sex"],
  age: ["age"],
  dob: ["dateofbirth", "dob", "birthdate", "birthday"],
  joined: ["subscriptionstart", "subscriptionstartdate", "startdate", "joined", "joindate", "dateofjoining", "signupdate", "customersince", "activationdate"],
  phone: ["phone", "phonenumber", "mobile", "mobilenumber", "contactnumber"],
  email: ["email", "emailid", "emailaddress"],
  address: ["address", "homeaddress", "location"],
  idNumber: ["idnumber", "idproof", "govtid", "nationalid", "aadhaar", "aadhar"],
  senior: ["seniorcitizen", "senior"],
  partner: ["partner"],
  dependents: ["dependents", "dependants"],
  tenure: ["tenure", "tenuremonths", "monthsasacustomer", "months"],
  phoneService: ["phoneservice"],
  multipleLines: ["multiplelines"],
  internet: ["internetservice", "internet", "internetplan"],
  onlineSecurity: ["onlinesecurity"],
  onlineBackup: ["onlinebackup"],
  deviceProtection: ["deviceprotection"],
  techSupport: ["techsupport"],
  streamingTV: ["streamingtv"],
  streamingMovies: ["streamingmovies"],
  contract: ["contract", "contracttype", "plantype"],
  paperless: ["paperlessbilling", "paperless"],
  payment: ["paymentmethod", "payment"],
  monthly: ["monthlycharges", "monthlybill", "monthlyfee", "monthlycharge"],
  total: ["totalcharges", "totalbilled", "totalspend"],
};

function pick(row, key) {
  const wanted = ALIASES[key];
  for (const h of Object.keys(row)) if (wanted.includes(norm(h))) return row[h];
  return undefined;
}

const num = (v) => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
};

// Yes / No / 1 / 0 / true → boolean; "No internet service" and "No phone service" count as No.
const bool = (v) => {
  if (v === undefined || v === "") return undefined;
  return ["yes", "y", "true", "1"].includes(String(v).trim().toLowerCase());
};

const oneOf = (v, list, fallback) => {
  if (v === undefined || v === "") return fallback;
  const n = norm(v);
  const hit = list.find((x) => norm(x) === n || norm(x).startsWith(n) || n.startsWith(norm(x)));
  if (hit) return hit;
  if (list === INTERNET && /fib/.test(n)) return "Fiber optic";
  if (list === CONTRACTS) { if (/month/.test(n)) return "Month-to-month"; if (/(1|one)/.test(n)) return "One year"; if (/(2|two)/.test(n)) return "Two year"; }
  if (list === PAYMENTS) { if (/elec/.test(n)) return "Electronic check"; if (/mail/.test(n)) return "Mailed check"; if (/bank/.test(n)) return "Bank transfer (automatic)"; if (/card/.test(n)) return "Credit card (automatic)"; }
  return fallback;
};

export function parseDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  let d;
  if (m) d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  else {
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (m) {
      const a = +m[1], b = +m[2];
      // 13/05/2022 can only be day-first; otherwise assume day-first (India) too.
      d = a > 12 || b <= 12 ? new Date(Date.UTC(+m[3], b - 1, a)) : new Date(Date.UTC(+m[3], a - 1, b));
    } else {
      const t = new Date(s);
      if (!Number.isNaN(t.getTime())) d = t;
    }
  }
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// Turns one CSV row into a customer input (buildCustomer fills in the rest, the model scores it afterwards).
export function rowToCustomer(row, index) {
  const first = pick(row, "firstName");
  const last = pick(row, "lastName");
  const customerId = pick(row, "customerId");
  let name = pick(row, "name") || [first, last].filter(Boolean).join(" ");
  if (!name) name = customerId ? `Customer ${customerId}` : `Customer ${index + 1}`;

  const tenure = num(pick(row, "tenure"));
  let joined = parseDate(pick(row, "joined"));
  if (joined && new Date(joined) > new Date()) joined = null;
  if (!joined && tenure !== undefined) joined = isoFromYearsAgo(tenure / 12);
  if (!joined) joined = isoFromYearsAgo(1);

  const g = String(pick(row, "gender") || "").toLowerCase();
  const gender = g.startsWith("m") ? "male" : g.startsWith("f") ? "female" : g ? "other" : "";
  const internet = oneOf(pick(row, "internet"), INTERNET, "DSL");
  const phoneService = bool(pick(row, "phoneService"));
  const f = {
    senior: bool(pick(row, "senior")),
    partner: bool(pick(row, "partner")),
    dependents: bool(pick(row, "dependents")),
    phoneService,
    multipleLines: bool(pick(row, "multipleLines")),
    internet,
    onlineSecurity: bool(pick(row, "onlineSecurity")),
    onlineBackup: bool(pick(row, "onlineBackup")),
    deviceProtection: bool(pick(row, "deviceProtection")),
    techSupport: bool(pick(row, "techSupport")),
    streamingTV: bool(pick(row, "streamingTV")),
    streamingMovies: bool(pick(row, "streamingMovies")),
    contract: oneOf(pick(row, "contract"), CONTRACTS, "Month-to-month"),
    paperless: bool(pick(row, "paperless")),
    payment: oneOf(pick(row, "payment"), PAYMENTS, "Electronic check"),
    monthly: num(pick(row, "monthly")),
    total: num(pick(row, "total")),
  };
  Object.keys(f).forEach((k) => { if (f[k] === undefined) delete f[k]; });   // missing → defaults

  const seniorFlag = f.senior;
  const ageGiven = num(pick(row, "age"));
  return {
    customerId,
    name,
    gender,
    age: ageGiven !== undefined ? ageGiven : seniorFlag === true ? 68 : seniorFlag === false ? 42 : undefined,
    dob: parseDate(pick(row, "dob")) || "",
    joined,
    phone: pick(row, "phone"),
    email: pick(row, "email"),
    address: pick(row, "address"),
    idNumber: pick(row, "idNumber"),
    features: f,
  };
}

export function rowsToCustomers(rows) {
  const customers = [];
  rows.forEach((r, i) => {
    if (!Object.values(r).some((v) => v !== "")) return;
    customers.push(rowToCustomer(r, i));
  });
  return { customers };
}

// Builds the sample CSV that users can download (and edit) from a list of customers.
export const CSV_COLUMNS = [
  "customerID", "name", "gender", "dateOfBirth", "subscriptionStart", "phone", "email", "address", "idNumber",
  "SeniorCitizen", "Partner", "Dependents", "PhoneService", "MultipleLines", "InternetService",
  "OnlineSecurity", "OnlineBackup", "DeviceProtection", "TechSupport", "StreamingTV", "StreamingMovies",
  "Contract", "PaperlessBilling", "PaymentMethod", "MonthlyCharges", "TotalCharges",
];
const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function customersToCSV(list, toRow) {
  const lines = [CSV_COLUMNS.join(",")];
  list.forEach((c) => {
    const m = toRow(c);
    lines.push([
      c.customerId, c.name, c.gender, c.dob, c.joined, c.phone, c.email, c.address, c.idNumber,
      m.SeniorCitizen, m.Partner, m.Dependents, m.PhoneService, m.MultipleLines, m.InternetService,
      m.OnlineSecurity, m.OnlineBackup, m.DeviceProtection, m.TechSupport, m.StreamingTV, m.StreamingMovies,
      m.Contract, m.PaperlessBilling, m.PaymentMethod, m.MonthlyCharges, m.TotalCharges,
    ].map(esc).join(","));
  });
  return lines.join("\n") + "\n";
}
