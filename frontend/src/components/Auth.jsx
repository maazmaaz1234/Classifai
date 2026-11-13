// Sign-in / create-account screen. Shown instead of the app until someone is signed in.
import { useEffect, useState } from "react";
import "../auth.css";
import AvatarPicker from "./AvatarPicker";
import Pandu from "./Pandu";
import { Logo } from "./Logo";
import { signIn, signUp } from "../lib/auth";
import { Words } from "./Words";

const EyeIcon = ({ off }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
    {off && <path d="M4 4l16 16" />}
  </svg>
);

export default function Auth({ ready, leaving = false }) {
  const [mode, setMode] = useState("in"); // in | up
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [pic, setPic] = useState({ photo: null, avatar: "" });
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [greet, setGreet] = useState(0);

  useEffect(() => {
    if (!ready) return undefined;
    const id = setTimeout(() => setGreet((g) => g + 1), 900);
    return () => clearTimeout(id);
  }, [ready]);

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setError(""); };
  const swap = () => { setMode((m) => (m === "in" ? "up" : "in")); setError(""); };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "up") await signUp({ ...form, photo: pic.photo, avatar: pic.avatar || null });
      else await signIn(form);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setBusy(false);
    }
  };

  const up = mode === "up";
  return (
    <div className={`auth${leaving ? " is-leaving" : ""}`}>
      <div className="auth-top a-in" style={{ "--k": 0 }}><Logo size={40} /></div>

      <div className="auth-grid">
        <section className="auth-card glass a-in" style={{ "--k": 2 }} aria-label={up ? "Create account" : "Sign in"}>
          <h1 className="auth-title">
            <span className="auth-line"><Words text={up ? "Create your" : "Welcome"} /></span>
            <span className="auth-line"><Words text={up ? "workspace." : "back."} start={2} className="ital grad" /></span>
          </h1>
          <p className="auth-sub">{up ? "Add your customers, upload their data, and see who might leave." : "Sign in to see who might leave, and why."}</p>

          <form onSubmit={submit} noValidate>
            {up && (
              <>
                <AvatarPicker photo={pic.photo} avatar={pic.avatar} name={form.name} fallbackSeed={form.email || form.name} onChange={setPic} compact />
                <div className="field">
                  <label htmlFor="au-name">Full name</label>
                  <input id="au-name" className="input" autoComplete="name" value={form.name} onChange={set("name")} placeholder="Your name" />
                </div>
              </>
            )}
            <div className="field">
              <label htmlFor="au-email">Email</label>
              <input id="au-email" className="input" type="email" autoComplete="email" value={form.email} onChange={set("email")} placeholder="you@company.com" />
            </div>
            <div className="field">
              <label htmlFor="au-pass">Password</label>
              <div className="pass">
                <input id="au-pass" className="input" type={show ? "text" : "password"} autoComplete={up ? "new-password" : "current-password"} value={form.password} onChange={set("password")} placeholder={up ? "At least 8 characters" : "Your password"} />
                <button type="button" className="pass-eye" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}><EyeIcon off={show} /></button>
              </div>
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
              {busy ? "One moment…" : up ? "Create account" : "Sign in"}
            </button>
          </form>

          <p className="auth-swap">
            {up ? "Already have an account?" : "New to Classifai?"}{" "}
            <button type="button" onClick={swap}>{up ? "Sign in" : "Create an account"}</button>
          </p>
          <p className="auth-note">Your account and customers are saved in your own Classifai database. Passwords are never stored in plain form.</p>
        </section>

        <aside className="auth-stage a-in" style={{ "--k": 4 }} aria-hidden="true">
          <div className="auth-pandu"><Pandu greetKey={greet} interactive={false} /></div>
        </aside>
      </div>
    </div>
  );
}
