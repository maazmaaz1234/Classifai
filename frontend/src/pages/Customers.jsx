import { useState } from "react";
import "../customers.css";
import useCountUp from "../hooks/useCountUp";
import { Words } from "../components/Words";
import { IconAlert, IconArrowUpRight, IconPeople, IconUpload, IconUserPlus } from "../components/icons";
import CustomerModal from "../components/CustomerModal";
import CustomersWindow from "../components/CustomersWindow";
import { pictureOf } from "../components/Avatar";
import { useData } from "../lib/store";

function Tile({ i, icon, title, caption, value, deco, onClick, tone }) {
  const shown = useCountUp(value ?? 0);
  return (
    <button type="button" className={`tile glass depth${tone ? ` tile-${tone}` : ""}`} data-tilt="8" style={{ "--i": i }} onClick={onClick}>
      <span className="tile-glare" aria-hidden="true" />
      <span className="tile-top">
        <span className="tile-icon" aria-hidden="true">{icon}</span>
        <span className="tile-go" aria-hidden="true"><IconArrowUpRight width="20" height="20" /></span>
      </span>
      <span className="tile-deco" aria-hidden="true">{deco}</span>
      <span className="tile-body">
        {value !== undefined && <span className="tile-num">{shown.toLocaleString()}</span>}
        <span className="tile-title">{title}</span>
        <span className="tile-cap">{caption}</span>
      </span>
    </button>
  );
}

export default function Customers({ onGo }) {
  const { customers } = useData();
  const [open, setOpen] = useState(null); // "add" | "csv" | "all" | "risk"
  const close = () => setOpen(null);

  const atRisk = customers.filter((c) => c.risk >= 0.5).length;
  const fan = customers.slice(-3);

  return (
    <section id="customers" className="page page-customers" aria-label="Customers" data-active="false">
      <div className="page-inner">
        <h2 className="page-title customers-title">
          <Words text="Your customers," />{" "}
          <Words text="who might leave." start={2} className="ital" />
        </h2>

        <div className="tiles">
          <Tile
            i={0}
            icon={<IconUserPlus />}
            title="Add customer"
            caption="Name, photo, contact details, plan and bill"
            onClick={() => setOpen("add")}
            deco={<span className="deco-plus"><i /><i /></span>}
          />
          <Tile
            i={1}
            icon={<IconUpload />}
            title="Import CSV"
            caption="Upload a whole customer file in one go"
            onClick={() => setOpen("csv")}
            deco={<span className="deco-plus"><i /><i /></span>}
          />
          <Tile
            i={2}
            icon={<IconPeople />}
            title="Total customers"
            caption={customers.length ? "Tap to browse every customer" : "None added yet"}
            value={customers.length}
            onClick={() => setOpen("all")}
            deco={
              <span className="deco-fan">
                {fan.map((c, k) => (
                  <span key={c.id} className="fan-card" style={{ "--k": k, "--n": fan.length }}>
                    <img src={pictureOf(c)} alt="" draggable="false" />
                  </span>
                ))}
              </span>
            }
          />
          <Tile
            i={3}
            tone="risk"
            icon={<IconAlert />}
            title="At-risk customers"
            caption={customers.length ? (atRisk ? "Likely to churn: tap to see who" : "Nobody above 50% right now") : "None added yet"}
            value={atRisk}
            onClick={() => setOpen("risk")}
            deco={<span className="deco-pulse"><i /><i /><i /></span>}
          />
        </div>
      </div>

      {(open === "add" || open === "csv") && <CustomerModal onClose={close} initialMode={open === "csv" ? "csv" : "manual"} />}
      {(open === "all" || open === "risk") && (
        <CustomersWindow
          mode={open}
          onClose={close}
          onAddCustomer={() => setOpen("add")}
          onOpenAnalysis={() => onGo?.("dashboard")}
        />
      )}
    </section>
  );
}
