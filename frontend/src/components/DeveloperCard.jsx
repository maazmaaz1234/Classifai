// The card Pandu shows when someone asks who built Classifai: three photos (Maaz, Kashif, Bhaskar), and the details of
// whoever is selected. Maaz starts selected, with a short intro and "Show more". Text lives in lib/developers.js.
import { useState } from "react";
import { DEVELOPERS, ageOf, bornText } from "../lib/developers";

export default function DeveloperCard({ focus = "maaz" }) {
  const [sel, setSel] = useState(focus);
  const [more, setMore] = useState(false);
  const dev = DEVELOPERS.find((d) => d.id === sel) || DEVELOPERS[0];

  return (
    <div className="devcard">
      <div className="devcard-head"><span>Meet the team behind Classifai</span></div>
      <div className="devcard-row" role="tablist" aria-label="Developers">
        {DEVELOPERS.map((d) => (
          <button
            key={d.id}
            type="button"
            role="tab"
            aria-selected={d.id === sel}
            className={`devcard-who${d.id === sel ? " is-on" : ""}${d.id === "maaz" ? " is-lead" : ""}`}
            onClick={() => { setSel(d.id); setMore(false); }}
          >
            <span className="devcard-photo"><img src={d.photo} alt={d.name} loading="lazy" draggable="false" /></span>
            <b>{d.short}</b>
            <small>{d.role}</small>
          </button>
        ))}
      </div>

      <div className="devcard-info" key={dev.id}>
        <h4>{dev.name}</h4>
        <ul className="devcard-facts">
          <li><span>Role</span><div>{dev.role}</div></li>
          <li><span>Born</span><div>{bornText(dev.dob)} <em>(age {ageOf(dev)})</em></div></li>
          {dev.studies && <li><span>Studies</span><div>{dev.studies}</div></li>}
        </ul>
        {dev.intro && <p className="devcard-intro">{dev.intro}</p>}
        {dev.more && more && dev.more.map((t) => <p key={t} className="devcard-more">{t}</p>)}
        {dev.more && (
          <button type="button" className="devcard-toggle" aria-expanded={more} onClick={() => setMore((m) => !m)}>
            {more ? "Show less" : "Show more"}
          </button>
        )}
      </div>
    </div>
  );
}
