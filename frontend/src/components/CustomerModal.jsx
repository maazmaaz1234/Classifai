// Add a customer (type one in, or upload a CSV) and edit an existing one. Same form for both.
import { useMemo, useRef, useState } from "react";
import Modal from "./Modal";
import AvatarPicker from "./AvatarPicker";
import { IconUpload } from "./icons";
import { actions, useData } from "../lib/store";
import { parseCSV, rowsToCustomers } from "../lib/csv";
import { validateCustomer } from "../lib/customer";
import { CONTRACTS, INTERNET, PAYMENTS, featuresOf } from "../lib/predict";
import { GENDERS, money, nextCustomerId } from "../lib/format";
import { toast } from "../lib/toast";

const MAX_ROWS = 3000;
const today = () => new Date().toISOString().slice(0, 10);

const BLANK = {
  name: "", gender: "", dob: "", phone: "", email: "", address: "", idNumber: "", customerId: "",
  joined: "", photo: null, avatar: "",
  contract: "Month-to-month", monthly: "", payment: "Electronic check", paperless: true,
  internet: "Fiber optic", phoneService: true, multipleLines: false,
  onlineSecurity: false, onlineBackup: false, deviceProtection: false, techSupport: false, streamingTV: false, streamingMovies: false,
  partner: false, dependents: false,
};

const fromCustomer = (c) => {
  const f = featuresOf(c);
  return {
    name: c.name, gender: c.gender || "", dob: c.dob || "", phone: c.phone || "", email: c.email || "", address: c.address || "", idNumber: c.idNumber || "",
    customerId: c.customerId, joined: c.joined || "", photo: c.photo || null, avatar: c.avatar || "",
    contract: f.contract, monthly: String(f.monthly ?? ""), payment: f.payment, paperless: !!f.paperless,
    internet: f.internet, phoneService: !!f.phoneService, multipleLines: !!f.multipleLines,
    onlineSecurity: !!f.onlineSecurity, onlineBackup: !!f.onlineBackup, deviceProtection: !!f.deviceProtection, techSupport: !!f.techSupport,
    streamingTV: !!f.streamingTV, streamingMovies: !!f.streamingMovies, partner: !!f.partner, dependents: !!f.dependents,
  };
};

const toInput = (v) => {
  const net = v.internet !== "No";
  return {
    name: v.name.trim(), gender: v.gender, dob: v.dob, phone: v.phone, email: v.email, address: v.address, idNumber: v.idNumber,
    customerId: v.customerId, joined: v.joined, photo: v.photo, avatar: v.avatar || undefined,
    features: {
      contract: v.contract, monthly: Number(v.monthly), total: undefined, payment: v.payment, paperless: v.paperless,
      internet: v.internet, phoneService: v.phoneService, multipleLines: v.phoneService && v.multipleLines,
      onlineSecurity: net && v.onlineSecurity, onlineBackup: net && v.onlineBackup, deviceProtection: net && v.deviceProtection,
      techSupport: net && v.techSupport, streamingTV: net && v.streamingTV, streamingMovies: net && v.streamingMovies,
      partner: v.partner, dependents: v.dependents,
    },
  };
};

function Switch({ label, checked, onChange, disabled, hint }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} className={`sw${checked ? " is-on" : ""}`} onClick={() => onChange(!checked)}>
      <span className="sw-knob" aria-hidden="true" />
      <span className="sw-text"><strong>{label}</strong>{hint && <small>{hint}</small>}</span>
    </button>
  );
}

export function CustomerForm({ value, onChange, errors, customers, editing }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  const flip = (k) => (on) => onChange({ ...value, [k]: on });
  const net = value.internet !== "No";
  const err = (k) => errors[k] && <small className="field-err" role="alert">{errors[k]}</small>;
  return (
    <div className="cform">
      <section className="cform-sec">
        <h3 className="cform-h">Who they are</h3>
        <AvatarPicker
          photo={value.photo} avatar={value.avatar} gender={value.gender} name={value.name} fallbackSeed={value.customerId || value.name}
          onChange={({ photo, avatar }) => onChange({ ...value, photo, avatar })}
        />
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="cu-name">Full name</label>
            <input id="cu-name" className="input" value={value.name} onChange={set("name")} placeholder="Aarav Sharma" autoComplete="off" />
            {err("name")}
          </div>
          <div className="field">
            <label htmlFor="cu-id">Customer ID <small>(blank = automatic)</small></label>
            <input id="cu-id" className="input" value={value.customerId} onChange={set("customerId")} placeholder={nextCustomerId(customers)} autoComplete="off" />
            {err("customerId")}
          </div>
          <div className="field">
            <span className="field-label">Gender</span>
            <div className="seg" role="group" aria-label="Gender">
              {GENDERS.map(([k, label]) => (
                <button key={k} type="button" aria-pressed={value.gender === k} onClick={() => onChange({ ...value, gender: value.gender === k ? "" : k })}>{label}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="cu-dob">Date of birth</label>
            <input id="cu-dob" type="date" className="input" value={value.dob} max={today()} onChange={set("dob")} />
            {err("dob")}
          </div>
          <div className="field">
            <label htmlFor="cu-id2">ID number <small>(optional)</small></label>
            <input id="cu-id2" className="input" value={value.idNumber} onChange={set("idNumber")} placeholder="ID proof number" autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="cu-phone">Phone number</label>
            <input id="cu-phone" className="input" type="tel" inputMode="tel" value={value.phone} onChange={set("phone")} placeholder="+91 98765 43210" autoComplete="off" />
            {err("phone")}
          </div>
          <div className="field">
            <label htmlFor="cu-email">Email</label>
            <input id="cu-email" className="input" type="email" value={value.email} onChange={set("email")} placeholder="name@example.com" autoComplete="off" />
            {err("email")}
          </div>
          <div className="field span-2">
            <label htmlFor="cu-addr">Address</label>
            <input id="cu-addr" className="input" value={value.address} onChange={set("address")} placeholder="12, MG Road, Bengaluru, Karnataka 560001" autoComplete="off" />
          </div>
        </div>
      </section>

      <section className="cform-sec">
        <h3 className="cform-h">Subscription <small>what the model looks at most</small></h3>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="cu-join">Subscription start date</label>
            <input id="cu-join" type="date" className="input" value={value.joined} max={today()} onChange={set("joined")} />
            {err("joined")}
          </div>
          <div className="field">
            <label htmlFor="cu-contract">Contract</label>
            <select id="cu-contract" className="select" value={value.contract} onChange={set("contract")}>{CONTRACTS.map((c) => <option key={c}>{c}</option>)}</select>
          </div>
          <div className="field">
            <label htmlFor="cu-monthly">Monthly bill</label>
            <input id="cu-monthly" className="input" inputMode="decimal" value={value.monthly} onChange={set("monthly")} placeholder="65.50" />
            {err("monthly")}
          </div>
          <div className="field">
            <label htmlFor="cu-pay">Payment method</label>
            <select id="cu-pay" className="select" value={value.payment} onChange={set("payment")}>{PAYMENTS.map((c) => <option key={c}>{c}</option>)}</select>
          </div>
          <div className="field span-2"><Switch label="Paperless billing" checked={value.paperless} onChange={flip("paperless")} /></div>
        </div>
      </section>

      <section className="cform-sec">
        <h3 className="cform-h">Services</h3>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="cu-net">Internet</label>
            <select id="cu-net" className="select" value={value.internet} onChange={set("internet")}>{INTERNET.map((c) => <option key={c} value={c}>{c === "No" ? "No internet" : c}</option>)}</select>
          </div>
          <div className="field sw-col">
            <Switch label="Phone service" checked={value.phoneService} onChange={flip("phoneService")} />
            <Switch label="Multiple lines" checked={value.phoneService && value.multipleLines} disabled={!value.phoneService} onChange={flip("multipleLines")} />
          </div>
          <div className="sw-grid span-2">
            <Switch label="Online security" checked={net && value.onlineSecurity} disabled={!net} onChange={flip("onlineSecurity")} />
            <Switch label="Online backup" checked={net && value.onlineBackup} disabled={!net} onChange={flip("onlineBackup")} />
            <Switch label="Device protection" checked={net && value.deviceProtection} disabled={!net} onChange={flip("deviceProtection")} />
            <Switch label="Tech support" checked={net && value.techSupport} disabled={!net} onChange={flip("techSupport")} />
            <Switch label="Streaming TV" checked={net && value.streamingTV} disabled={!net} onChange={flip("streamingTV")} />
            <Switch label="Streaming movies" checked={net && value.streamingMovies} disabled={!net} onChange={flip("streamingMovies")} />
          </div>
        </div>
      </section>

      <section className="cform-sec">
        <h3 className="cform-h">Household</h3>
        <div className="sw-grid">
          <Switch label="Has a partner" checked={value.partner} onChange={flip("partner")} />
          <Switch label="Has dependants" checked={value.dependents} onChange={flip("dependents")} />
        </div>
      </section>
      {editing && <p className="form-note">Saving scores this customer again with the new details.</p>}
    </div>
  );
}

export default function CustomerModal({ onClose, customer = null, initialMode = "manual" }) {
  const { customers } = useData();
  const editing = !!customer;
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState(() => (customer ? fromCustomer(customer) : { ...BLANK, joined: today() }));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [csv, setCsv] = useState(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef(null);
  const bodyRef = useRef(null);

  const submitManual = async (e, close, another) => {
    e?.preventDefault?.();
    const errs = validateCustomer(form, customers, customer?.id);
    setErrors(errs);
    if (Object.keys(errs).length) {
      setError("Please fix the highlighted fields.");
      requestAnimationFrame(() => bodyRef.current?.querySelector(".field-err")?.scrollIntoView({ block: "center", behavior: "smooth" }));
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (editing) {
        await actions.updateCustomer(customer.id, toInput(form));
        toast(`${form.name.trim()} updated`);
        close();
      } else {
        await actions.addCustomers([toInput(form)]);
        toast(`${form.name.trim()} added`);
        if (another) { setForm({ ...BLANK, joined: today(), contract: form.contract, internet: form.internet, payment: form.payment }); bodyRef.current?.scrollTo?.({ top: 0 }); }
        else close();
      }
    } catch (err) {
      setError(err.message || "Could not save. Please try again.");      // for example: the server is not running
    } finally { setBusy(false); }
  };

  const readFile = async (file) => {
    if (!file) return;
    setError("");
    if (!/\.(csv|txt|tsv)$/i.test(file.name) && !file.type.includes("csv") && !file.type.includes("text")) { setCsv(null); return setError("Choose a .csv file."); }
    try {
      const text = await file.text();
      const { rows } = parseCSV(text);
      if (rows.length === 0) { setCsv(null); return setError("That file has no rows. The first row must be the column names."); }
      const { customers: found } = rowsToCustomers(rows.slice(0, MAX_ROWS));
      if (!found.length) { setCsv(null); return setError("No customer rows were found in that file."); }
      setCsv({ fileName: file.name, customers: found, total: rows.length, unnamed: found.filter((x) => /^Customer /.test(x.name)).length });
    } catch { setCsv(null); setError("Could not read that file."); }
  };

  const submitCsv = async (close) => {
    if (!csv) return setError("Choose a CSV file first.");
    setBusy(true);
    setError("");
    try {
      const added = await actions.addCustomers(csv.customers, (done, total) => setProgress(`${done.toLocaleString()} of ${total.toLocaleString()}`));
      toast(`${added.length.toLocaleString()} customers added`);
      close();
    } catch (err) {
      setError(err.message || "Could not save the customers. Please try again.");
    } finally { setBusy(false); setProgress(""); }
  };

  const preview = useMemo(() => (csv ? csv.customers.slice(0, 4) : []), [csv]);

  return (
    <Modal title={editing ? "Edit customer" : "Add customer"} subtitle={editing ? `${customer.name} · ${customer.customerId}` : "Type one customer in, or upload a whole CSV file."} onClose={onClose} size={760}>
      {({ close }) => (
        <div className="stack" ref={bodyRef}>
          {!editing && (
            <div className="seg" role="group" aria-label="Method">
              <button type="button" aria-pressed={mode === "manual"} onClick={() => { setMode("manual"); setError(""); }}>Enter manually</button>
              <button type="button" aria-pressed={mode === "csv"} onClick={() => { setMode("csv"); setError(""); }}>Upload CSV</button>
            </div>
          )}

          {mode === "manual" ? (
            <form onSubmit={(e) => submitManual(e, close, false)} noValidate>
              <CustomerForm value={form} onChange={(v) => { setForm(v); setErrors({}); setError(""); }} errors={errors} customers={customers} editing={editing} />
              {error && <p className="form-error" role="alert" style={{ marginTop: 16 }}>{error}</p>}
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
                {!editing && <button type="button" className="btn btn-ghost" disabled={busy} onClick={(e) => submitManual(e, close, true)}>Add and add another</button>}
                <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Add customer"}</button>
              </div>
            </form>
          ) : (
            <div>
              <div
                className={`dropzone${drag ? " is-drag" : ""}${csv ? " has-image" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); readFile(e.dataTransfer.files?.[0]); }}
              >
                <button type="button" className="dropzone-btn" onClick={() => fileRef.current?.click()}>
                  <IconUpload />
                  <strong>{csv ? csv.fileName : "Choose a CSV file"}</strong>
                  <small>{csv ? "Click to choose a different file" : "or drag and drop it here"}</small>
                </button>
                <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv" hidden onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = ""; }} />
              </div>
              <p className="form-note" style={{ marginTop: 10 }}>
                The first row must be the column names. Classifai understands the Telco-churn columns (<em>customerID, gender, SeniorCitizen, tenure, Contract, InternetService, MonthlyCharges…</em>)
                plus <em>name, dateOfBirth, subscriptionStart, phone, email, address, idNumber</em>.{" "}
                <a className="link" href="/sample-customers.csv" download>Download a sample file</a>
              </p>
              {csv && (
                <div className="csv-preview">
                  <p className="csv-summary"><strong>{csv.customers.length.toLocaleString()} customers</strong> ready to add{csv.total > MAX_ROWS ? ` (the first ${MAX_ROWS.toLocaleString()} rows)` : ""}.</p>
                  {csv.unnamed > 0 && <p className="form-note">{csv.unnamed.toLocaleString()} rows have no name, so they are called “Customer” plus their ID.</p>}
                  <div className="csv-table" role="table" aria-label="Preview">
                    <div className="csv-row csv-head" role="row"><span>ID</span><span>Name</span><span>Contract</span><span>Monthly</span></div>
                    {preview.map((p, i) => (
                      <div className="csv-row" role="row" key={i}>
                        <span>{p.customerId || "auto"}</span><span>{p.name}</span><span>{p.features.contract}</span><span>{money(p.features.monthly, 2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {error && <p className="form-error" role="alert" style={{ marginTop: 16 }}>{error}</p>}
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
                <button type="button" className="btn btn-primary" disabled={busy || !csv} onClick={() => submitCsv(close)}>
                  {busy ? (progress ? `Scoring ${progress}…` : "Scoring…") : csv ? `Add ${csv.customers.length.toLocaleString()} customers` : "Add customers"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

