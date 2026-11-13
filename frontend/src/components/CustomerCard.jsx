// The card used in the 3D carousels (Total customers, At-risk customers).
import Avatar from "./Avatar";
import { featuresOf } from "../lib/predict";
import { money, pct, riskColor, tenureText } from "../lib/format";

export default function CustomerCard({ customer: c }) {
  const f = featuresOf(c);
  const tier = c.risk >= 0.5 ? "is-high" : c.risk >= 0.3 ? "is-mid" : "";
  return (
    <article className="ccard ccard-person" style={{ "--t": riskColor(c.risk) }}>
      <div className="ccard-media ccard-avatar">
        <Avatar person={c} size="min(56%, 168px)" className="ccard-pic" />
        <span className="ccard-tag">{c.customerId}</span>
        <span className={`ccard-risk ${tier}`}>{pct(c.risk)}</span>
      </div>
      <div className="ccard-body">
        <h3 className="ccard-name">{c.name}</h3>
        <p className="ccard-sub">{f.contract} · {f.internet === "No" ? "No internet" : f.internet}</p>
        <dl className="ccard-facts">
          <div><dt>With us</dt><dd>{tenureText(c.joined)}</dd></div>
          <div><dt>Monthly</dt><dd>{money(f.monthly, 2)}</dd></div>
        </dl>
      </div>
    </article>
  );
}
