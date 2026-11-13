// Everything about one customer on the Dashboard and on their own page: profile, journey prediction, and the reasons behind the score.
import { LineChart, RiskRing } from "./charts";
import Avatar from "./Avatar";
import { IconSpark } from "./icons";
import { ACTIONS, cumulativeLeave, expectedChurnMonth, featuresOf, reasonsFor, revenueAtRisk } from "../lib/predict";
import { selectionActions } from "../lib/store";
import { ui } from "../lib/ui";
import { formatDate, money, pct, riskColor, riskTier, tenureText, tierLabel } from "../lib/format";
import { monthLabels } from "../lib/analytics";

const monthName = (d) => d.toLocaleString("en", { month: "short", year: "numeric" });
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), 28));
export const tierClass = (risk) => (risk >= 0.5 ? "high" : risk >= 0.3 ? "mid" : "low");

export function SourceNote({ customer: c }) {
  return (
    <p className="source-note mono">
      <i className={`dot ${c.source === "api" ? "is-api" : ""}`} />
      {c.source === "api" ? "Scored by your SVM model" : "Scored by the built-in demo scorer. Connect your SVM (backend/app.py) for real predictions."}
    </p>
  );
}

// the compact card on the Dashboard when one customer is selected
export function CustomerProfile({ customer: c }) {
  const f = featuresOf(c);
  const tier = riskTier(c.risk);
  return (
    <section className="panel glass depth" style={{ "--i": 3 }} aria-label="Customer profile">
      <div className="prof-top">
        <Avatar person={c} size={64} className="prof-av" />
        <div className="prof-id">
          <h3>{c.name}</h3>
          <p>{c.customerId} · {f.contract}</p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => selectionActions.setCustomer(null)}>All customers</button>
      </div>
      <dl className="facts">
        <div><dt>Subscribed</dt><dd>{formatDate(c.joined)}</dd></div>
        <div><dt>With us</dt><dd>{tenureText(c.joined)}</dd></div>
        <div><dt>Monthly bill</dt><dd>{money(f.monthly, 2)}</dd></div>
        <div><dt>Churn risk</dt><dd style={{ color: riskColor(c.risk) }}>{pct(c.risk)} · {tierLabel[tier]}</dd></div>
      </dl>
      <div className="row" style={{ marginBottom: 12 }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => ui.openProfile(c.id)}>Open full profile</button>
      </div>
      <SourceNote customer={c} />
    </section>
  );
}

function Journey({ customer: c }) {
  const now = new Date();
  const joined = new Date(c.joined);
  const end = addMonths(now, 12);
  const span = Math.max(1, end - joined);
  const pos = (d) => `${Math.min(100, Math.max(0, ((d - joined) / span) * 100))}%`;
  const exitMonth = expectedChurnMonth(c.risk);
  const exitDate = addMonths(now, exitMonth);
  const likely = c.risk >= 0.3;
  const col = riskColor(c.risk);
  return (
    <div className="journey" aria-label="Journey timeline">
      <div className="journey-track">
        <span className="journey-past" style={{ width: pos(now) }} />
        <span className="journey-future" style={{ left: pos(now), right: 0, background: `linear-gradient(90deg, ${col}, transparent)` }} />
        <span className="jmark jmark-join" style={{ left: "0%" }}><i /></span>
        <span className="jmark jmark-now" style={{ left: pos(now) }}><i /></span>
        {likely && <span className="jmark jmark-exit" style={{ left: pos(exitDate), "--c": col }}><i /></span>}
      </div>
      <div className="journey-labels">
        <span className="jlab" style={{ left: 0, textAlign: "left", transform: "none" }}><b>Subscribed</b>{formatDate(c.joined)}</span>
        <span className="jlab" style={{ left: `clamp(70px, ${pos(now)}, calc(100% - 150px))` }}><b>Today</b>{tenureText(c.joined)}</span>
        <span className="jlab" style={{ right: 0, left: "auto", textAlign: "right", transform: "none", color: col }}>
          <b>{likely ? "Most likely to cancel" : "Forecast ends"}</b>{likely ? monthName(exitDate) : monthName(end)}
        </span>
      </div>
    </div>
  );
}

export function CustomerJourney({ customer: c, index = 1 }) {
  const labels = monthLabels();
  const values = labels.map((_, m) => cumulativeLeave(c.risk, m) * 100);
  const tier = riskTier(c.risk);
  const exitDate = addMonths(new Date(), expectedChurnMonth(c.risk));
  const first = c.name.split(" ")[0];
  const summary =
    tier === "low"
      ? `${pct(c.risk)} chance of churning in the next 12 months. ${first} is likely to stay.`
      : `${pct(c.risk)} chance of churning in the next 12 months, most likely around ${monthName(exitDate)}.`;
  return (
    <section className="panel glass depth" style={{ "--i": index }} aria-label="Journey prediction">
      <header className="panel-head">
        <div><h3>Journey prediction</h3><p className="mono">Subscribed → today → next 12 months</p></div>
        <span className={`tier-pill tier-${tierClass(c.risk)}`}>{tierLabel[tier]}</span>
      </header>
      <div className="journey-top">
        <RiskRing value={c.risk} label="12-month risk" tone={riskColor(c.risk)} />
        <p className="journey-sum">{summary}</p>
      </div>
      <Journey customer={c} />
      <LineChart
        series={[{ name: "Chance of having churned", color: riskColor(c.risk), values }]}
        labels={labels}
        format={(v) => `${v >= 10 ? Math.round(v) : v.toFixed(1)}%`}
        height={190}
        ariaLabel={`Chance that ${c.name} has churned, month by month`}
      />
      <div className="svm-strip">
        <div><span className="mono">Revenue at risk</span><strong>{money(revenueAtRisk(c))}</strong><small>of {money(featuresOf(c).monthly * 12)} a year</small></div>
        {typeof c.decision === "number" && (
          <div><span className="mono">SVM decision score</span><strong>{c.decision > 0 ? "+" : ""}{c.decision.toFixed(2)}</strong><small>{c.decision > 0 ? "on the churn side of the boundary" : "on the stay side of the boundary"}</small></div>
        )}
        <div><span className="mono">Expected to cancel</span><strong>{c.risk >= 0.3 ? monthName(exitDate) : "not this year"}</strong><small>{c.risk >= 0.3 ? `about month ${expectedChurnMonth(c.risk)}` : "risk stays low"}</small></div>
      </div>
    </section>
  );
}

export function CustomerReasons({ customer: c, index = 2 }) {
  const reasons = reasonsFor(c).filter((r) => typeof r.impact === "number");
  const up = reasons.filter((r) => r.impact > 0).sort((a, b) => b.impact - a.impact);
  const down = reasons.filter((r) => r.impact < 0).sort((a, b) => a.impact - b.impact);
  const max = Math.max(0.5, ...reasons.map((r) => Math.abs(r.impact)));
  const plays = up.map((r) => ({ key: r.key, text: ACTIONS[r.key] })).filter((p) => p.text).slice(0, 3);
  const Row = ({ r, good }) => (
    <li className={`reason${good ? " is-good" : ""}`}>
      <div className="reason-text"><strong>{r.label || r.feature}</strong>{r.detail && <small>{r.detail}</small>}</div>
      <span className="reason-bar" aria-hidden="true"><i style={{ width: `${Math.max(8, (Math.abs(r.impact) / max) * 100)}%` }} /></span>
    </li>
  );
  return (
    <section className="panel glass depth" style={{ "--i": index }} aria-label="Reasons">
      <header className="panel-head"><div><h3>Why this score</h3><p className="mono">What pushes {c.name.split(" ")[0]} toward or away from cancelling</p></div></header>
      {reasons.length === 0 ? <p className="form-note">No reasons were returned for this customer.</p> : (
        <div className="reasons">
          {up.length > 0 && (<div><h4 className="reasons-h is-up">Pushing toward churn</h4><ul>{up.slice(0, 5).map((r, i) => <Row key={i} r={r} />)}</ul></div>)}
          {down.length > 0 && (<div><h4 className="reasons-h is-down">Keeping them subscribed</h4><ul>{down.slice(0, 4).map((r, i) => <Row key={i} r={r} good />)}</ul></div>)}
        </div>
      )}
      <div className="action-box">
        <IconSpark width="20" height="20" />
        <div>
          <strong>Retention playbook</strong>
          {plays.length ? (
            <ol className="plays">{plays.map((p) => <li key={p.key}>{p.text}</li>)}</ol>
          ) : (
            <p>No urgent action. Keep the service reliable and check in now and then.</p>
          )}
        </div>
      </div>
    </section>
  );
}
