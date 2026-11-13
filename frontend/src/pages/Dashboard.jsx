import { useEffect, useMemo, useRef, useState } from "react";
import "../dashboard.css";
import { Words } from "../components/Words";
import SegmentPicker from "../components/SegmentPicker";
import CustomerPicker from "../components/CustomerPicker";
import AskPandu from "../components/AskPandu";
import CustomersWindow from "../components/CustomersWindow";
import Avatar from "../components/Avatar";
import { CustomerJourney, CustomerProfile, CustomerReasons } from "../components/CustomerView";
import { LineChart, Sparkline } from "../components/charts";
import { IconArrowUpRight, IconPeople } from "../components/icons";
import useCountUp from "../hooks/useCountUp";
import { actions, selectionActions, useData, useSelection } from "../lib/store";
import { DIMENSIONS, applyFilter, expectedLeavers, filterIsEmpty, filterLabel, leaversBySegment, monthLabels, riskByTenure, summary, tierCounts, topDrivers } from "../lib/analytics";
import { money, pct } from "../lib/format";
import { featuresOf } from "../lib/predict";

const SERIES = ["#ff3b52", "#ffb83d", "#3aa1ff", "#f7f2f3"];
const fmtCount = (v) => (v >= 10 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, ""));

function Signal({ label, value, caption, values, color }) {
  return (
    <div className="signal">
      <div className="signal-text"><span className="signal-label">{label}</span><strong className="signal-value">{value}</strong><small>{caption}</small></div>
      <Sparkline values={values} color={color} label={`${label} trend`} />
    </div>
  );
}

export default function Dashboard({ onGo, onAsk }) {
  const { customers } = useData();
  const { filter, customerId } = useSelection();
  const [view, setView] = useState("total");
  const [dim, setDim] = useState("contract");
  const [topN, setTopN] = useState(5);
  const [churnOpen, setChurnOpen] = useState(false);
  const listRef = useRef(null);
  const [moreBelow, setMoreBelow] = useState(false);
  const checkMore = () => {
    const el = listRef.current;
    setMoreBelow(!!el && el.scrollHeight - el.scrollTop - el.clientHeight > 6);
  };

  const scope = useMemo(() => applyFilter(customers, filter), [customers, filter]);
  const customer = customerId ? scope.find((c) => c.id === customerId) || null : null;

  const stats = useMemo(() => summary(scope), [scope]);
  const mix = useMemo(() => tierCounts(scope), [scope]);
  const labels = useMemo(() => monthLabels(), []);
  const totalCurve = useMemo(() => expectedLeavers(scope), [scope]);
  const highCurve = useMemo(() => expectedLeavers(stats.high), [stats.high]);
  const tenureRisk = useMemo(() => riskByTenure(scope), [scope]);
  const bySegment = useMemo(() => leaversBySegment(scope, dim), [scope, dim]);
  const drivers = useMemo(() => topDrivers(scope), [scope]);
  const ranked = useMemo(() => [...scope].sort((a, b) => b.risk - a.risk), [scope]);
  useEffect(() => { const id = requestAnimationFrame(checkMore); return () => cancelAnimationFrame(id); }, [topN, ranked]); // eslint-disable-line react-hooks/exhaustive-deps
  const cases = useMemo(() => ranked.filter((c) => c.risk >= 0.5), [ranked]);

  const total = useCountUp(scope.length);
  const churnCount = useCountUp(cases.length);

  const noCustomers = customers.length === 0;
  const noMatch = !noCustomers && scope.length === 0;
  const expectedEnd = totalCurve[12];
  const empty = noCustomers || noMatch;

  return (
    <section id="dashboard" className="page page-dashboard" aria-label="Dashboard" data-active="false">
      <div className="page-inner">
        <h2 className="page-title dash-title"><Words text="Dashboard" /></h2>

        <div className="dash-grid">
          {/* ── left: what are we looking at? ─────────────── */}
          <div className="dash-left">
            <div className="depth dash-row" style={{ "--i": 0 }}><SegmentPicker /></div>

            <div className="dash-two depth dash-row" style={{ "--i": 1 }}>
              <div className={`total-tile${customer ? "" : " is-active"}`}>
                <span className="total-label">Total customers</span>
                <strong className="total-num">{total.toLocaleString()}</strong>
                <small>{scope.length ? (filterIsEmpty(filter) ? "across your whole base" : filterLabel(filter)) : "none yet"}</small>
              </div>
              <div className="pick-tile">
                <span className="total-label">One customer</span>
                <CustomerPicker people={ranked} selected={customer} active={!!customer} />
                <small>{customer ? "Showing their analysis" : "Or pick someone to see their journey"}</small>
              </div>
            </div>

            <div className="depth dash-row" style={{ "--i": 2 }}><AskPandu onAsk={onAsk} /></div>

            {customer ? (
              <CustomerProfile customer={customer} />
            ) : (
              <>
                <section className="panel glass depth signals" style={{ "--i": 3 }} aria-label="Signals">
                  <Signal label="Expected to churn" value={empty ? "—" : `${Math.round(stats.expected)}`} caption="customers, next 12 months" values={totalCurve} color="#ff3b52" />
                  <Signal label="Revenue at risk" value={empty ? "—" : money(stats.atRisk)} caption={empty ? "per year" : `of ${money(stats.revenue)} billed a year`} values={tenureRisk.some((v) => v > 0) ? tenureRisk : [0, 0]} color="#ffb83d" />
                  <Signal label="Likely to churn" value={empty ? "—" : `${cases.length}`} caption={empty ? "risk above 50%" : `risk above 50% · average ${pct(stats.avg)}`} values={highCurve} color="#3aa1ff" />
                </section>

                {!empty && (
                  <section className="panel glass depth drivers" style={{ "--i": 4 }} aria-label="What drives churn">
                    <header className="panel-head">
                      <div><h3>What drives churn</h3><p className="mono">Among {drivers.label}</p></div>
                    </header>
                    <div className="mixbar" role="img" aria-label={`${mix.low} likely to stay, ${mix.medium} at risk, ${mix.high} likely to churn`}>
                      <i className="mix-low" style={{ flexGrow: mix.low }} /><i className="mix-mid" style={{ flexGrow: mix.medium }} /><i className="mix-high" style={{ flexGrow: mix.high }} />
                    </div>
                    <div className="mix-legend mono"><span><b className="mix-dot mix-low" />{mix.low} stay</span><span><b className="mix-dot mix-mid" />{mix.medium} at risk</span><span><b className="mix-dot mix-high" />{mix.high} churn</span></div>
                    <ul className="driver-list">
                      {drivers.drivers.length === 0 && <li className="form-note">No single reason stands out yet.</li>}
                      {drivers.drivers.map((d) => (
                        <li key={d.key}>
                          <button type="button" className="driver" onClick={() => onAsk(`How do I reduce churn caused by "${d.label}"?`)}>
                            <span className="driver-name">{d.label}</span>
                            <span className="driver-bar" aria-hidden="true"><i style={{ width: `${Math.round(d.share * 100)}%` }} /></span>
                            <span className="driver-pct mono">{Math.round(d.share * 100)}%</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}
          </div>

          {/* ── right: what does it say? ──────────────────── */}
          <div className="dash-right">
            {empty ? (
              <section className="panel glass depth dash-empty" style={{ "--i": 1 }}>
                <IconPeople width="40" height="40" />
                <h3>{noCustomers ? "No data yet" : "No customers in this segment"}</h3>
                <p>{noCustomers ? "Add your customers, or import a CSV, and the churn forecast appears here." : "Choose a different segment, or clear the filter."}</p>
                <div className="row">
                  {noCustomers ? (
                    <>
                      <button type="button" className="btn btn-primary" onClick={() => onGo("customers")}>Add customers</button>
                      <button type="button" className="btn btn-ghost" onClick={() => actions.loadSample()}>Try with sample data</button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-primary" onClick={() => selectionActions.setFilter({})}>Show all customers</button>
                  )}
                </div>
              </section>
            ) : customer ? (
              <>
                <CustomerJourney customer={customer} />
                <CustomerReasons customer={customer} />
              </>
            ) : (
              <>
                <section className="panel glass depth" style={{ "--i": 1 }} aria-label="Churn forecast">
                  <header className="panel-head">
                    <div><h3>Churn forecast</h3><p className="mono">Expected customers lost, next 12 months</p></div>
                    <div className="row">
                      {view === "seg" && (
                        <select className="select forecast-dim" value={dim} onChange={(e) => setDim(e.target.value)} aria-label="Group customers by">
                          {Object.entries(DIMENSIONS).map(([k, d]) => <option key={k} value={k}>By {d.label.toLowerCase()}</option>)}
                        </select>
                      )}
                      <div className="seg" role="group" aria-label="Forecast view">
                        <button type="button" aria-pressed={view === "total"} onClick={() => setView("total")}>Total</button>
                        <button type="button" aria-pressed={view === "seg"} onClick={() => setView("seg")}>By segment</button>
                      </div>
                    </div>
                  </header>
                  {view === "total" ? (
                    <LineChart key="t" series={[{ name: "Expected churn", color: SERIES[0], values: totalCurve }]} labels={labels} format={fmtCount} height={176} ariaLabel="Expected number of customers who churn, month by month" />
                  ) : (
                    <>
                      <LineChart key={`d-${dim}`} series={bySegment.map((d, i) => ({ name: d.name, color: SERIES[i % SERIES.length], values: d.total }))} labels={labels} format={fmtCount} height={176} area={false} ariaLabel={`Expected churn by ${DIMENSIONS[dim].label.toLowerCase()}`} />
                      <ul className="legend">{bySegment.map((d, i) => <li key={d.name}><i style={{ background: SERIES[i % SERIES.length] }} />{d.name} · {d.people.length}</li>)}</ul>
                    </>
                  )}
                  <p className="forecast-note">
                    By {labels[12]}, about <strong>{fmtCount(expectedEnd)}</strong> of {scope.length.toLocaleString()} customers ({pct(expectedEnd / scope.length)}) are expected to churn.
                  </p>
                </section>

                <section className="panel glass depth cases" style={{ "--i": 2 }} aria-label="At-risk customers">
                  <header className="cases-head">
                    <button type="button" className="cases-open" onClick={() => setChurnOpen(true)} aria-label="Open all at-risk customers">
                      <span className="cases-label">Churn cases <IconArrowUpRight width="18" height="18" /></span>
                      <strong className="cases-num">{churnCount.toLocaleString()}</strong>
                      <small>likely to churn · tap to open</small>
                    </button>
                    <label className="topn">
                      <span className="mono">Show</span>
                      <select className="select" value={topN} onChange={(e) => setTopN(Number(e.target.value))} aria-label="How many to list">
                        {[5, 10, 15, 25].map((n) => <option key={n} value={n}>Top {n}</option>)}
                      </select>
                    </label>
                  </header>
                  <ol className="case-list" data-scroll ref={listRef} onScroll={checkMore} data-more={moreBelow}>
                    {ranked.slice(0, topN).map((c, i) => (
                      <li key={c.id}>
                        <button type="button" className="case" onClick={() => selectionActions.setCustomer(c.id)}>
                          <span className="case-rank mono">{String(i + 1).padStart(2, "0")}</span>
                          <Avatar person={c} size={36} className="mini-av" />
                          <span className="case-who"><strong>{c.name}</strong><small>{c.customerId} · {featuresOf(c).contract}</small></span>
                          <span className="case-bar" aria-hidden="true"><i style={{ width: `${Math.round(c.risk * 100)}%` }} className={c.risk >= 0.5 ? "is-high" : c.risk >= 0.3 ? "is-mid" : ""} /></span>
                          <span className="case-pct">{pct(c.risk)}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </section>
              </>
            )}
          </div>
        </div>
      </div>
      {churnOpen && (
        <CustomersWindow
          mode="risk"
          people={cases.length ? cases : ranked.slice(0, topN)}
          title={cases.length ? "Churn cases" : `Top ${topN} by risk`}
          onClose={() => setChurnOpen(false)}
          onAddCustomer={() => onGo("customers")}
          onOpenAnalysis={() => { /* already on the dashboard */ }}
        />
      )}
    </section>
  );
}
