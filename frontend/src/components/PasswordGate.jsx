// Asks for the account password before something that cannot be undone or that changes a customer:
//   if (await requirePassword({ title: "Remove Divya Khan?", confirm: "Remove customer", danger: true })) { ... }
// It checks the same password the person signed in with. Mount <PasswordGateHost /> once, near the root.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Modal from "./Modal";
import { getSession, verifyPassword } from "../lib/auth";

let request = null;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
const useRequest = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => request);

export function requirePassword({ title = "Confirm it's you", message = "Enter your password to continue.", confirm = "Confirm", danger = false } = {}) {
  return new Promise((resolve) => {
    if (request) request.resolve(false);          // only one question at a time
    request = { title, message, confirm, danger, resolve };
    emit();
  });
}

const EyeIcon = ({ off }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
    {off && <path d="M4 4l16 16" />}
  </svg>
);

function Ask({ req, onDone }) {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const email = getSession()?.email;

  useEffect(() => { const id = setTimeout(() => inputRef.current?.focus(), 200); return () => clearTimeout(id); }, []);

  const submit = async (e, close) => {
    e.preventDefault();
    if (busy) return;
    if (!pw) return setErr("Enter your password.");
    setBusy(true);
    const ok = await verifyPassword(pw);
    setBusy(false);
    if (!ok) { setErr("That password isn't right."); setPw(""); inputRef.current?.focus(); return; }
    req.resolve(true);
    close();
  };

  return (
    <Modal title={req.title} subtitle={email ? `Signed in as ${email}` : undefined} onClose={() => { req.resolve(false); onDone(); }} size={460}>
      {({ close }) => (
        <form onSubmit={(e) => submit(e, close)} noValidate className="stack">
          <p className="gate-msg">{req.message}</p>
          <div className="field">
            <label htmlFor="gate-pw">Password</label>
            <div className="pass">
              <input
                ref={inputRef}
                id="gate-pw"
                className="input"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                value={pw}
                onChange={(e) => { setPw(e.target.value); setErr(""); }}
                placeholder="The password you sign in with"
              />
              <button type="button" className="pass-eye" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}><EyeIcon off={show} /></button>
            </div>
          </div>
          {err && <p className="form-error" role="alert">{err}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
            <button type="submit" className={`btn ${req.danger ? "btn-danger" : "btn-primary"}`} disabled={busy}>{busy ? "Checking…" : req.confirm}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function PasswordGateHost() {
  const req = useRequest();
  if (!req) return null;
  return <Ask key={req.title + req.confirm} req={req} onDone={() => { if (request === req) { request = null; emit(); } }} />;
}
