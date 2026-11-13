// "Select segment ∨": narrow the dashboard to groups of customers (contract, internet plan, time with us, payment), then press Done.
import { useEffect, useState } from "react";
import Popover from "./Popover";
import { IconCheck, IconChevronDown } from "./icons";
import { selectionActions, useData, useSelection } from "../lib/store";
import { DIMENSIONS, applyFilter, filterIsEmpty, filterLabel } from "../lib/analytics";

const ORDER = ["contract", "internet", "tenure", "payment"];

export default function SegmentPicker() {
  const { customers } = useData();
  const { filter } = useSelection();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({});

  useEffect(() => { if (open) setDraft({ ...filter }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);

  const toggle = (dim, value) => setDraft((d) => {
    const cur = d[dim] || [];
    return { ...d, [dim]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] };
  });
  const done = () => { selectionActions.setFilter(draft); setOpen(false); };
  const matching = applyFilter(customers, draft).length;
  const label = filterIsEmpty(filter) ? (customers.length ? `All customers · ${customers.length.toLocaleString()}` : "Select segment") : filterLabel(filter);

  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      className="pick"
      trigger={
        <button type="button" className={`dash-select${open ? " is-open" : ""}${!filterIsEmpty(filter) ? " is-active" : ""}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)} disabled={customers.length === 0}>
          <span>{label}</span>
          <IconChevronDown width="20" height="20" />
        </button>
      }
    >
      <div className="pop-list seg-list" data-scroll>
        {ORDER.map((dim) => {
          const d = DIMENSIONS[dim];
          return (
            <div key={dim} className="seg-group">
              <p className="mono seg-title">{d.label}</p>
              {d.values.map((v) => {
                const on = (draft[dim] || []).includes(v);
                const count = customers.filter((c) => d.of(c) === v).length;
                return (
                  <button type="button" key={v} className="pop-row" role="checkbox" aria-checked={on} onClick={() => toggle(dim, v)}>
                    <span className={`check${on ? " is-on" : ""}`}>{on && <IconCheck width="14" height="14" />}</span>
                    <span className="pop-text"><strong>{d.valueLabel ? d.valueLabel(v) : v}</strong></span>
                    <small className="seg-count">{count.toLocaleString()}</small>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="pop-foot">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft({})}>Clear</button>
        <span className="mono">{matching.toLocaleString()} customers</span>
        <button type="button" className="btn btn-primary btn-sm" onClick={done}>Done</button>
      </div>
    </Popover>
  );
}
