// The navigation: a black pill along the bottom of the screen with a glass lens that glides to the page you are on.
// The lens is a spring-loaded transform (it stretches a little while it travels, then settles), and only the page you
// are on shows its name. Pure CSS (see dock.css): nothing runs per frame, so it never costs scroll speed.
import { useEffect, useRef, useState } from "react";

const ICONS = {
  home: <><path d="M3.5 10.8 12 3.6l8.5 7.2" /><path d="M5.6 9.6V20h12.8V9.6" /><path d="M10 20v-5.4h4V20" /></>,
  customers: <><circle cx="9" cy="8" r="3.3" /><path d="M2.8 19.5c.4-3.5 3-5.6 6.2-5.6s5.8 2.1 6.2 5.6" /><path d="M16 5.2a3.1 3.1 0 0 1 0 5.8M17.4 14.2c2.2.5 3.6 2.4 3.9 5.3" /></>,
  dashboard: <><rect x="3.5" y="3.5" width="7.2" height="9" rx="1.6" /><rect x="13.3" y="3.5" width="7.2" height="5.2" rx="1.6" /><rect x="13.3" y="11.8" width="7.2" height="8.7" rx="1.6" /><rect x="3.5" y="15.6" width="7.2" height="4.9" rx="1.6" /></>,
  model: <><circle cx="12" cy="5.2" r="2" /><circle cx="6" cy="14" r="2" /><circle cx="18" cy="14" r="2" /><circle cx="12" cy="20" r="1.6" /><path d="M12 7.2v3.6M12 10.8 7.2 12.6M12 10.8l4.8 1.8M12 10.8v7.6" /></>,
  support: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3.3" /><path d="m6 6 3.7 3.7M18 6l-3.7 3.7M6 18l3.7-3.7M18 18l-3.7-3.7" /></>,
};

export default function Dock({ items, active, onSelect }) {
  const index = Math.max(0, items.findIndex((it) => it.id === active));

  // while the lens is travelling it stretches a touch; it relaxes about a quarter of a second after the page changes
  const [moving, setMoving] = useState(false);
  const last = useRef(index);
  useEffect(() => {
    if (last.current === index) return undefined;
    last.current = index;
    setMoving(true);
    const t = setTimeout(() => setMoving(false), 240);
    return () => clearTimeout(t);
  }, [index]);

  return (
    <nav className="dock" aria-label="Main" style={{ "--i": index, "--n": items.length }}>
      <span className={`dock-lens${moving ? " is-moving" : ""}`} aria-hidden="true" />
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className={`dock-item${active === it.id ? " is-active" : ""}`}
          aria-label={it.label}
          aria-current={active === it.id ? "page" : undefined}
          onClick={() => onSelect(it.id)}
        >
          <svg className="dock-icon" viewBox="0 0 24 24" aria-hidden="true">{ICONS[it.id]}</svg>
          <span className="dock-label">{it.label}</span>
        </button>
      ))}
    </nav>
  );
}
