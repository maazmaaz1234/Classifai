// The big animated window behind "Total customers" and "At-risk customers":
// a 3D carousel of cards (drag, scroll, arrow keys, or the slider) over the live ribbon background.
// Moving to another card surges and re-routes the ribbon, so the background moves with you.
import { useEffect, useState } from "react";
import Modal, { CloseIcon } from "./Modal";
import Carousel3D from "./Carousel3D";
import { IconChevronLeft, IconChevronRight } from "./icons";
import { clamp, withAlpha } from "../lib/format";
import { fx } from "../lib/ui";

function useCardSize() {
  const calc = () => {
    const hMax = clamp(window.innerHeight - 340, 300, 440);
    const w = Math.min(Math.round(hMax * 0.72), Math.round(window.innerWidth * 0.7));
    return { w, h: Math.round(w / 0.72) };
  };
  const [size, setSize] = useState(calc);
  useEffect(() => {
    const on = () => setSize(calc());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return size;
}

export default function CarouselWindow({ title, label, items, renderCard, tintOf, empty, tools, actions, resetKey, onClose, onOpen, scene = "customers", unit = "card" }) {
  const [index, setIndex] = useState(0);
  const { w, h } = useCardSize();

  useEffect(() => { setIndex(0); }, [resetKey]);
  const n = items.length;
  const i = clamp(index, 0, Math.max(0, n - 1));
  const active = items[i];
  const tint = active ? tintOf(active) : "#ff2d46";

  // the ribbon follows the card you are on: it slides sideways and surges for a moment on every change
  useEffect(() => {
    const progress = n > 1 ? (i / (n - 1)) * 2 - 1 : 0;
    fx.shift = 0.55 * Math.sin(i * 0.85) + 0.45 * progress;
    fx.speed = 1.7;
    const id = setTimeout(() => { fx.speed = 0; }, 650);
    return () => clearTimeout(id);
  }, [i, n]);
  useEffect(() => () => { fx.shift = 0; fx.speed = 0; }, []);

  return (
    <Modal bare label={label || title} onClose={onClose} tint={withAlpha(tint, 0.16)} scene={scene}>
      {({ close }) => (
        <div className="win">
          <header className="win-head">
            <div>
              <h2 className="win-title">{title}</h2>
              <p className="win-count mono">{n.toLocaleString()} {n === 1 ? unit : `${unit}s`} · drag, scroll or use ← →{onOpen ? " · click a card to open it" : ""}</p>
            </div>
            <div className="win-tools">
              {tools}
              <button type="button" className="icon-btn" aria-label="Close" onClick={close}><CloseIcon /></button>
            </div>
          </header>

          {n === 0 ? (
            <div className="win-empty">{empty(close)}</div>
          ) : (
            <>
              <Carousel3D items={items} index={i} onIndex={setIndex} renderCard={renderCard} onOpen={onOpen} cardW={w} cardH={h} tint={tint} />
              <footer className="win-foot">
                <button type="button" className="icon-btn" aria-label="Previous" disabled={i === 0} onClick={() => setIndex(i - 1)}><IconChevronLeft /></button>
                <div className="win-scrub">
                  <input type="range" min="0" max={Math.max(0, n - 1)} value={i} aria-label="Position" onChange={(e) => setIndex(Number(e.target.value))} style={{ "--p": n > 1 ? `${(i / (n - 1)) * 100}%` : "0%" }} />
                  <span className="mono">{i + 1} / {n.toLocaleString()}</span>
                </div>
                <button type="button" className="icon-btn" aria-label="Next" disabled={i === n - 1} onClick={() => setIndex(i + 1)}><IconChevronRight /></button>
                <div className="win-actions">{actions?.(active, close)}</div>
              </footer>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
