// "Total customers" (everyone, with search by customer ID, name, phone or email) and
// "At-risk customers" (everyone likely to churn, riskiest first). Same 3D carousel; clicking the front card opens that customer's page.
import { useMemo, useState } from "react";
import CarouselWindow from "./CarouselWindow";
import CustomerCard from "./CustomerCard";
import { IconCheck, IconPeople, IconSearch, IconTrash } from "./icons";
import { requirePassword } from "./PasswordGate";
import { actions, selectionActions, useData } from "../lib/store";
import { riskColor } from "../lib/format";
import { ui } from "../lib/ui";
import { toast } from "../lib/toast";

const TIERS = [["all", "Everyone"], ["high", "Likely to churn"], ["medium", "At risk"], ["low", "Likely to stay"]];
const tierOf = (p) => (p >= 0.5 ? "high" : p >= 0.3 ? "medium" : "low");

export default function CustomersWindow({ mode = "all", people, title, onClose, onAddCustomer, onOpenAnalysis }) {
  const { customers } = useData();
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState("all");
  const risk = mode === "risk";

  const base = useMemo(() => {
    if (people) return people;
    if (risk) return customers.filter((c) => c.risk >= 0.5).sort((a, b) => b.risk - a.risk);
    return customers;
  }, [customers, people, risk]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return base.filter(
      (c) => (tier === "all" || tierOf(c.risk) === tier) &&
        (!q || c.customerId.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q) || (c.phone || "").replace(/\s/g, "").includes(q.replace(/\s/g, ""))),
    );
  }, [base, query, tier]);

  const remove = async (c) => {
    const ok = await requirePassword({ title: `Remove ${c.name}?`, message: `This deletes ${c.name} (${c.customerId}) and their prediction. Enter your password to confirm.`, confirm: "Remove customer", danger: true });
    if (!ok) return;
    actions.removeCustomer(c.id);
    toast(`${c.name} removed`);
  };

  const tools = (
    <>
      <select className="select win-select" aria-label="Filter by risk" value={tier} onChange={(e) => setTier(e.target.value)}>
        {TIERS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
      </select>
      <label className="win-search">
        <IconSearch width="18" height="18" />
        <input
          className="input" type="search" placeholder="Search by customer ID or name" value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && items.length >= 1) ui.openProfile(items[0].id); }}
          aria-label="Search customers by customer ID, name, phone or email"
        />
      </label>
    </>
  );

  return (
    <CarouselWindow
      title={title || (risk ? "At-risk customers" : "Total customers")}
      unit="customer"
      scene={risk ? "atrisk" : "customers"}
      items={items}
      renderCard={(c) => <CustomerCard customer={c} />}
      tintOf={(c) => riskColor(c.risk)}
      resetKey={`${query}|${tier}|${base.length}`}
      tools={tools}
      onClose={onClose}
      onOpen={(c) => ui.openProfile(c.id)}
      empty={(close) =>
        customers.length === 0 ? (
          <div className="empty-box">
            <IconPeople width="38" height="38" />
            <strong>No customers yet</strong>
            <p>Add customers by hand, upload a CSV file, or try the sample data.</p>
            <div className="row">
              <button type="button" className="btn btn-primary" onClick={() => { close(); setTimeout(onAddCustomer, 360); }}>Add customer</button>
              <button type="button" className="btn btn-ghost" onClick={() => actions.loadSample()}>Try with sample data</button>
            </div>
          </div>
        ) : base.length === 0 ? (
          <div className="empty-box">
            <IconCheck width="38" height="38" />
            <strong>No customers at risk</strong>
            <p>Nobody is likely to churn right now.</p>
          </div>
        ) : (
          <div className="empty-box">
            <IconSearch width="38" height="38" />
            <strong>No customer matches</strong>
            <p>Check the customer ID, or clear the filters.</p>
            <button type="button" className="btn btn-ghost" onClick={() => { setQuery(""); setTier("all"); }}>Clear filters</button>
          </div>
        )
      }
      actions={(c, close) => (
        <>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => ui.openProfile(c.id)}>Open profile</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { selectionActions.openCustomer(c.id); close(); setTimeout(() => onOpenAnalysis?.(), 340); }}>Open analytics</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(c)} aria-label={`Remove ${c.name}`}><IconTrash /> Remove</button>
        </>
      )}
    />
  );
}

