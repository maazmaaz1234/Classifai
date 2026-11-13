import { useState } from "react";
import { Words } from "../components/Words";
import { IconArrowUpRight } from "../components/icons";
import { PanduFace } from "../components/Pandu";
import { METRICS, MODEL } from "../lib/modelInfo";

// Support: ask Pandu, quick questions, the FAQ, and where to go for more.
// The contact cards are placeholders for a college project: swap the mailto address for your team's.
const PROMPTS = [
  { q: "How does the SVM decide who might leave?", tag: "The model" },
  { q: "What should my customer CSV look like?", tag: "Your data" },
  { q: "Which customers should I call first?", tag: "Your results" },
  { q: "Who developed Classifai?", tag: "The team" },
];

const FAQ = [
  ["What does Classifai predict?", "The chance that each customer cancels their subscription, or simply stops using the product, within the next 12 months, plus the main reasons behind that score and what to do about it."],
  ["Which algorithm is used?", `A Support Vector Machine with an ${MODEL.kernel} kernel. It draws the widest possible street between customers who stayed and customers who left, and a customer's distance from that boundary becomes the churn probability.`],
  ["What columns should my CSV have?", "Name, Customer ID, Gender, Date of birth, Subscription start, Phone, Email, Contract, Internet service, Monthly charges and similar. The Telco churn column names work too. A 40-row sample file is below."],
  ["Is my data stored anywhere?", "Customers you add are saved in the Classifai database on your own server, under your own account. Removing or editing a customer asks for your password first."],
  ["How accurate is it?", `On the held-out test set the model reaches about ${Math.round(METRICS[0][1])}% accuracy and a ROC-AUC of ${METRICS[3][1]}. Treat scores as a prompt to look after a customer, not a verdict.`],
];

const CONTACTS = [
  { t: "Project team", s: "Final-year ML project", href: "mailto:team@classifai.app", cta: "Email us" },
  { t: "How it works", s: "The SVM, step by step", go: "model", cta: "View the model" },
  { t: "Sample data", s: "40 example customers", href: "/sample-customers.csv", cta: "Download CSV", download: true },
];

export default function Support({ onAsk, onGo }) {
  const [open, setOpen] = useState(0);
  return (
    <section id="support" className="page page-support" aria-label="Support" data-active="false">
      <div className="page-inner">
        <div className="support">
          <div className="support-copy">
            <h2 className="page-title support-title depth" style={{ "--i": 0 }}>
              <span className="hero-line"><Words text="Stuck on" /></span>
              <span className="hero-line"><Words text="something?" start={2} className="ital" /></span>
            </h2>
            <p className="page-sub depth" style={{ "--i": 1 }}>
              <Words text="Pandu reads your customers and predictions, so you can ask in plain words." start={4} step={38} plain />
            </p>
            <div className="depth" style={{ "--i": 2, marginTop: 26 }}>
              <button type="button" className="btn btn-primary" onClick={() => onAsk()}>
                <PanduFace size={26} /> Ask Pandu
              </button>
            </div>
          </div>

          <div className="support-panel glass depth" style={{ "--i": 1 }}>
            <p className="mono support-kicker">Try asking</p>
            <ul className="support-list">
              {PROMPTS.map((p) => (
                <li key={p.q}>
                  <button type="button" className="support-row" onClick={() => onAsk(p.q)}>
                    <span className="support-tag mono">{p.tag}</span>
                    <span className="support-q">{p.q}</span>
                    <IconArrowUpRight width="18" height="18" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="support-more">
          <div className="faq">
            <p className="eyebrow depth">Frequently asked</p>
            {FAQ.map(([q, a], i) => (
              <div key={q} className={`faq-item glass depth${open === i ? " is-open" : ""}`}>
                <button type="button" className="faq-q" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>
                  <span>{q}</span><i className="faq-plus" aria-hidden="true" />
                </button>
                <div className="faq-a"><div><p>{a}</p></div></div>
              </div>
            ))}
          </div>
          <div className="contact">
            <p className="eyebrow depth">Get in touch</p>
            {CONTACTS.map((c) => {
              const body = (
                <>
                  <div><h3>{c.t}</h3><p>{c.s}</p></div>
                  <span className="contact-cta">{c.cta} <IconArrowUpRight width="16" height="16" /></span>
                </>
              );
              return c.go ? (
                <button key={c.t} type="button" className="contact-card glass depth" data-tilt="7" onClick={() => onGo?.(c.go)}>{body}</button>
              ) : (
                <a key={c.t} href={c.href} className="contact-card glass depth" data-tilt="7" {...(c.download ? { download: true } : {})}>{body}</a>
              );
            })}
          </div>
        </div>

        <footer className="site-foot">
          <span>© 2026 Classifai · Customer churn prediction with an SVM</span>
          <span className="mono">Made with Pandu</span>
        </footer>
      </div>
    </section>
  );
}
