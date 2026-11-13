// A customer's own full page: picture, name and every detail. "Open analytics" shows the journey and the reasons;
// Edit and Remove ask for your password first. Opens from a card in the carousels (ui.openProfile).
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Avatar from "./Avatar";
import CustomerModal from "./CustomerModal";
import { CustomerJourney, CustomerReasons, SourceNote, tierClass } from "./CustomerView";
import { requirePassword } from "./PasswordGate";
import { IconCheck, IconChevronLeft, IconSpark, IconTrash } from "./icons";
import { actions, selectionActions, useData } from "../lib/store";
import { ui, useUI } from "../lib/ui";
import { featuresOf, hasInternet, isSenior, revenueAtRisk, totalCharges } from "../lib/predict";
import { ageFromDob, formatDate, genderLabel, money, pct, riskColor, riskTier, tenureText, tierLabel } from "../lib/format";
import { toast } from "../lib/toast";

const Row = ({ k, children }) => (
  <div className="kv-row"><dt>{k}</dt><dd>{children || <span className="kv-none">Not given</span>}</dd></div>
);
const Tag = ({ on, children }) => <span className={`svc${on ? " is-on" : ""}`}>{on && <IconCheck width="14" height="14" />}{children}</span>;

function CustomerPage({ customer: c, onGo, onAsk }) {
  const [closing, setClosing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const analyticsRef = useRef(null);
  const f = featuresOf(c);
  const net = hasInternet(f);
  const age = c.dob ? ageFromDob(c.dob) : null;
  const tier = riskTier(c.risk);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(() => ui.closeProfile(), 300);
  }, []);

  // ribbon route, page hidden behind, no scrolling underneath
  useEffect(() => {
    const release = ui.pushScene("profile");
    const unhold = ui.holdPage();
    document.documentElement.dataset.cpage = "true";     // hides the carousel window underneath, so only the ribbon is behind this page
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { release(); unhold(); delete document.documentElement.dataset.cpage; document.body.style.overflow = prev; };
  }, []);

  // Escape closes the page (and not the window behind it); the arrows must not move the carousel behind
  useEffect(() => {
    const onKey = (e) => {
      if (editing) return;
      if (e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); close(); }
      else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !e.target.closest?.("input, textarea, select")) e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [close, editing]);

  useEffect(() => {
    if (analytics) { const id = setTimeout(() => analyticsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80); return () => clearTimeout(id); }
    return undefined;
  }, [analytics]);

  const edit = async () => {
    const ok = await requirePassword({ title: "Edit this customer", message: `Enter your password to change ${c.name}'s details.`, confirm: "Continue" });
    if (ok) setEditing(true);
  };
  const remove = async () => {
    const ok = await requirePassword({ title: `Remove ${c.name}?`, message: `This deletes ${c.name} (${c.customerId}) and their prediction. Enter your password to confirm.`, confirm: "Remove customer", danger: true });
    if (!ok) return;
    actions.removeCustomer(c.id);
    toast(`${c.name} removed`);
    ui.closeProfile();
  };
  const toDashboard = () => { selectionActions.openCustomer(c.id); ui.closeProfile(); onGo?.("dashboard"); };

  return createPortal(
    <div className={`cpage${closing ? " is-closing" : ""}`} role="dialog" aria-modal="true" aria-label={`${c.name}, customer profile`} style={{ "--t": riskColor(c.risk) }}>
      <div className="cpage-scroll" data-scroll>
        <div className="cpage-inner">
          <div className="cpage-bar">
            <button type="button" className="btn btn-ghost btn-sm" onClick={close}><IconChevronLeft /> Back</button>
            <div className="row">
              <button type="button" className="btn btn-ghost btn-sm" onClick={edit}>Edit details</button>
              <button type="button" className="btn btn-ghost btn-sm cpage-remove" onClick={remove}><IconTrash /> Remove</button>
            </div>
          </div>

          <header className="cpage-hero">
            <div className="cpage-pic"><Avatar person={c} size="100%" alt={c.name} /></div>
            <div className="cpage-head">
              <p className="mono cpage-kicker">{c.customerId}</p>
              <h1 className="cpage-name">{c.name}</h1>
              <div className="cpage-chips">
                <span className={`tier-pill tier-${tierClass(c.risk)}`}>{pct(c.risk)} · {tierLabel[tier]}</span>
                <span className="cpage-chip">{f.contract}</span>
                <span className="cpage-chip">Customer for {tenureText(c.joined)}</span>
              </div>
              <div className="row cpage-cta">
                <button type="button" className="btn btn-primary" onClick={() => setAnalytics((a) => !a)} aria-expanded={analytics}><IconSpark /> {analytics ? "Hide analytics" : "Open analytics"}</button>
                <button type="button" className="btn btn-ghost" onClick={toDashboard}>View on dashboard</button>
                {onAsk && <button type="button" className="btn btn-ghost" onClick={() => onAsk(`Tell me about ${c.name}`)}>Ask Pandu</button>}
              </div>
            </div>
          </header>

          <div className="cpage-grid">
            <section className="panel glass cpage-card" aria-label="Personal details">
              <h2 className="cpage-h">Personal details</h2>
              <dl className="kv">
                <Row k="Full name">{c.name}</Row>
                <Row k="Gender">{c.gender ? genderLabel(c.gender) : ""}</Row>
                <Row k="Age">{age !== null ? `${age} years` : ""}</Row>
                <Row k="Date of birth">{c.dob ? formatDate(c.dob) : ""}</Row>
                <Row k="Customer ID"><span className="mono">{c.customerId}</span></Row>
                <Row k="ID number"><span className="mono">{c.idNumber}</span></Row>
                <Row k="Phone">{c.phone}</Row>
                <Row k="Email">{c.email && <a className="link" href={`mailto:${c.email}`}>{c.email}</a>}</Row>
                <Row k="Address">{c.address}</Row>
              </dl>
            </section>

            <section className="panel glass cpage-card" aria-label="Subscription">
              <h2 className="cpage-h">Subscription</h2>
              <dl className="kv">
                <Row k="Subscription start">{formatDate(c.joined)}</Row>
                <Row k="With us">{tenureText(c.joined)}</Row>
                <Row k="Contract">{f.contract}</Row>
                <Row k="Monthly bill">{money(f.monthly, 2)}</Row>
                <Row k="Total billed">{money(totalCharges(c), 2)}</Row>
                <Row k="Payment method">{f.payment}</Row>
                <Row k="Paperless billing">{f.paperless ? "Yes" : "No"}</Row>
                <Row k="Revenue at risk"><span style={{ color: riskColor(c.risk) }}>{money(revenueAtRisk(c))}</span> <small className="kv-small">in the next 12 months</small></Row>
              </dl>
            </section>

            <section className="panel glass cpage-card" aria-label="Services and household">
              <h2 className="cpage-h">Services and household</h2>
              <dl className="kv">
                <Row k="Internet">{f.internet === "No" ? "No internet" : f.internet}</Row>
                <Row k="Phone">{f.phoneService ? (f.multipleLines ? "Phone, multiple lines" : "Phone, one line") : "No phone service"}</Row>
                <Row k="Household">{[f.partner ? "Has a partner" : "No partner", f.dependents ? "has dependants" : "no dependants", isSenior(c) ? "senior citizen" : ""].filter(Boolean).join(" · ")}</Row>
              </dl>
              <div className="svc-wrap" aria-label="Add-ons">
                <Tag on={net && f.onlineSecurity}>Online security</Tag>
                <Tag on={net && f.onlineBackup}>Online backup</Tag>
                <Tag on={net && f.deviceProtection}>Device protection</Tag>
                <Tag on={net && f.techSupport}>Tech support</Tag>
                <Tag on={net && f.streamingTV}>Streaming TV</Tag>
                <Tag on={net && f.streamingMovies}>Streaming movies</Tag>
              </div>
              <SourceNote customer={c} />
            </section>
          </div>

          {analytics && (
            <div className="cpage-analytics" ref={analyticsRef}>
              <p className="eyebrow">Analytics</p>
              <div className="cpage-an-grid">
                <CustomerJourney customer={c} index={0} />
                <CustomerReasons customer={c} index={0} />
              </div>
            </div>
          )}
        </div>
      </div>
      {editing && <CustomerModal customer={c} onClose={() => setEditing(false)} />}
    </div>,
    document.body,
  );
}

export default function CustomerPageHost({ onGo, onAsk }) {
  const { profile } = useUI();
  const { customers } = useData();
  const c = profile ? customers.find((x) => x.id === profile.id) : null;
  useEffect(() => { if (profile && !c) ui.closeProfile(); }, [profile, c]);
  if (!c) return null;
  return <CustomerPage key={c.id} customer={c} onGo={onGo} onAsk={onAsk} />;
}
