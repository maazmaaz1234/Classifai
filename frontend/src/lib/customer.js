// One place that turns "whatever we know about a customer" into a complete, consistent customer record.
// Used by the add / edit form, the CSV import, the sample data and the store.
import { ageFromDob, dobFromAge, isoFromYearsAgo, nextCustomerId, uid } from "./format";
import { defaultAvatarFor, avatarFits, isAvatarId } from "./avatars";
import { DEFAULT_FEATURES } from "./predict";

const clean = (v) => String(v ?? "").trim();

export function buildCustomer(input, existing = []) {
  const name = clean(input.name) || "Customer";
  const gender = ["male", "female", "other"].includes(input.gender) ? input.gender : "";
  const age = Number(input.age);
  const dob = clean(input.dob) || (Number.isFinite(age) && age > 0 ? dobFromAge(Math.round(age), name) : "");
  const features = { ...DEFAULT_FEATURES, ...(input.features || {}) };
  features.senior = dob ? ageFromDob(dob) >= 65 : !!features.senior;
  const customerId = clean(input.customerId) || nextCustomerId(existing);
  const avatar = isAvatarId(input.avatar) && avatarFits(input.avatar, gender)
    ? input.avatar
    : defaultAvatarFor(customerId + name, gender);
  return {
    id: input.id || uid("cus"),
    customerId,
    name,
    gender,
    dob,
    joined: clean(input.joined) || isoFromYearsAgo(0.5),
    phone: clean(input.phone),
    email: clean(input.email),
    address: clean(input.address),
    idNumber: clean(input.idNumber),
    photo: input.photo || null,
    avatar,
    features,
    createdAt: input.createdAt || Date.now(),
  };
}

// Checks the form fields; returns { field: message } (empty = fine).
export function validateCustomer(v, others = [], editingId = null) {
  const e = {};
  if (clean(v.name).length < 2) e.name = "Enter the customer's name.";
  if (clean(v.customerId) && others.some((c) => c.id !== editingId && c.customerId.toLowerCase() === clean(v.customerId).toLowerCase())) e.customerId = "That customer ID is already used.";
  if (clean(v.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean(v.email))) e.email = "That email address doesn't look right.";
  if (clean(v.phone) && clean(v.phone).replace(/\D/g, "").length < 7) e.phone = "That phone number looks too short.";
  const monthly = Number(v.monthly);
  if (!(monthly >= 0) || v.monthly === "") e.monthly = "Enter the monthly bill.";
  if (clean(v.dob)) {
    const a = ageFromDob(v.dob);
    if (a === null || a < 0 || a > 120) e.dob = "Enter a real date of birth.";
  }
  if (!clean(v.joined)) e.joined = "Enter when the subscription started.";
  else if (new Date(v.joined) > new Date()) e.joined = "The start date can't be in the future.";
  return e;
}
