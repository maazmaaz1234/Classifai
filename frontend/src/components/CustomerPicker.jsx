// "Select customer ∨": a searchable list (by name or customer ID) of the customers in the chosen segment.
import { useMemo, useState } from "react";
import Popover from "./Popover";
import Avatar from "./Avatar";
import { IconChevronDown, IconSearch } from "./icons";
import { selectionActions } from "../lib/store";
import { pct } from "../lib/format";

export default function CustomerPicker({ people, selected, active }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const f = s ? people.filter((c) => c.name.toLowerCase().includes(s) || c.customerId.toLowerCase().includes(s)) : people;
    return f.slice(0, 80);
  }, [people, q]);

  return (
    <Popover
      open={open}
      onClose={() => { setOpen(false); setQ(""); }}
      className="pick"
      align="right"
      trigger={
        <button type="button" className={`dash-select${active ? " is-active" : ""}${open ? " is-open" : ""}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)} disabled={people.length === 0}>
          <span>{selected ? selected.name : "Select customer"}</span>
          <IconChevronDown width="20" height="20" />
        </button>
      }
    >
      <label className="pop-search">
        <IconSearch width="18" height="18" />
        <input autoFocus className="input" placeholder="Search name or customer ID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" />
      </label>
      <div className="pop-list" data-scroll>
        {list.length === 0 && <p className="pop-empty">No one matches “{q}”.</p>}
        {list.map((c) => (
          <button
            type="button"
            key={c.id}
            className={`pop-row${selected?.id === c.id ? " is-on" : ""}`}
            onClick={() => { selectionActions.setCustomer(c.id); setOpen(false); setQ(""); }}
          >
            <Avatar person={c} size={36} className="mini-av" />
            <span className="pop-text"><strong>{c.name}</strong><small>{c.customerId}</small></span>
            <span className={`risk-chip tier-${c.risk >= 0.5 ? "high" : c.risk >= 0.3 ? "mid" : "low"}`}>{pct(c.risk)}</span>
          </button>
        ))}
        {people.length > list.length && !q && <p className="pop-empty">Showing 80 of {people.length.toLocaleString()}. Search to find anyone.</p>}
      </div>
    </Popover>
  );
}
