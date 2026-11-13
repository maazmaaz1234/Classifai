// A 3D carousel in the spirit of the "cans" reference: cards sit on an arc in real depth,
// the active one is large and square-on, neighbours turn toward it.
// Works with the mouse (drag, wheel, click a side card), the keyboard (← →) and touch (swipe).
import { useEffect, useRef } from "react";
import { clamp } from "../lib/format";

const WINDOW = 6; // how many cards to render on each side of the active one

export default function Carousel3D({ items, index, onIndex, renderCard, onOpen, cardW = 300, cardH = 400, tint = "#ff3b52" }) {
  const stageRef = useRef(null);
  const els = useRef(new Map());
  const sim = useRef({ pos: index, drag: 0, dragging: false, startX: 0, moved: 0, lastX: 0, vel: 0 });
  const latest = useRef({ index, items, onIndex });
  latest.current = { index, items, onIndex };

  // Position every card from the smoothed float position each frame.
  useEffect(() => {
    const s = sim.current;
    let raf = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let last = performance.now();
    const frame = (now = performance.now()) => {
      const dt = Math.min(0.25, Math.max(0.001, (now - last) / 1000));
      last = now;
      const { index: idx } = latest.current;
      const target = idx + s.drag;
      s.pos += (target - s.pos) * (reduced ? 1 : 1 - Math.exp(-dt * 7.6));   // same feel at any frame rate
      const spacing = cardW * 0.62;
      els.current.forEach((el, i) => {
        const o = i - s.pos;
        const a = Math.abs(o);
        const sign = Math.sign(o);
        const tx = a <= 1 ? o * spacing * 1.18 : sign * (spacing * 1.18 + (a - 1) * spacing * 0.7);
        const tz = -Math.min(a, 4) * 170;
        const ry = clamp(-o, -1.4, 1.4) * 40;
        const rz = clamp(o, -3, 3) * 1.6;
        const sc = 1 - Math.min(a, 3) * 0.07;
        const ty = Math.min(a, 3) * 14;
        el.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, ${tz.toFixed(1)}px) rotateY(${ry.toFixed(2)}deg) rotateZ(${rz.toFixed(2)}deg) scale(${sc.toFixed(3)})`;
        el.style.opacity = clamp(1 - (a - 2.1) / 1.7, 0, 1).toFixed(3);
        el.style.zIndex = String(200 - Math.round(a * 20));
        el.style.setProperty("--dim", clamp(a * 0.2, 0, 0.62).toFixed(3));
        el.style.pointerEvents = a > 3.4 ? "none" : "auto";
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [cardW]);

  // Keyboard + wheel.
  useEffect(() => {
    const go = (d) => {
      const { index: idx, items: list, onIndex: set } = latest.current;
      set(clamp(idx + d, 0, list.length - 1));
    };
    const onKey = (e) => {
      if (e.target.closest?.("input, textarea, select")) return;
      if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
      else if (e.key === "Home") go(-9999);
      else if (e.key === "End") go(9999);
    };
    let acc = 0;
    let cool = 0;
    const onWheel = (e) => {
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      acc += d;
      const now = performance.now();
      if (Math.abs(acc) > 50 && now - cool > 170) { go(acc > 0 ? 1 : -1); acc = 0; cool = now; }
      if (now - cool > 400) acc = 0;
    };
    const stage = stageRef.current;
    document.addEventListener("keydown", onKey);
    stage?.addEventListener("wheel", onWheel, { passive: true });
    return () => { document.removeEventListener("keydown", onKey); stage?.removeEventListener("wheel", onWheel); };
  }, []);

  // Drag / swipe.
  const onPointerDown = (e) => {
    const s = sim.current;
    s.dragging = true; s.startX = e.clientX; s.lastX = e.clientX; s.moved = 0; s.vel = 0; s.captured = false;
  };
  const onPointerMove = (e) => {
    const s = sim.current;
    if (!s.dragging) return;
    const dx = e.clientX - s.startX;
    s.moved = Math.max(s.moved, Math.abs(dx));
    // only start capturing once it is a real drag, so a plain tap still reaches the card that was clicked
    if (!s.captured && s.moved >= 6) { s.captured = true; stageRef.current.setPointerCapture?.(e.pointerId); }
    s.vel = e.clientX - s.lastX;
    s.lastX = e.clientX;
    s.drag = clamp(-dx / (cardW * 0.62), -1.6, 1.6);
  };
  const onPointerUp = () => {
    const s = sim.current;
    if (!s.dragging) return;
    s.dragging = false;
    const { index: idx, items: list, onIndex: set } = latest.current;
    const flick = clamp(-s.vel / 28, -1, 1);
    const step = Math.round(s.drag + flick * 0.6);
    s.pos = idx + s.drag; // keep continuity
    s.drag = 0;
    if (step !== 0) set(clamp(idx + step, 0, list.length - 1));
  };

  const from = Math.max(0, index - WINDOW);
  const to = Math.min(items.length - 1, index + WINDOW);
  const visible = [];
  for (let i = from; i <= to; i++) visible.push(i);

  return (
    <div
      ref={stageRef}
      className="carousel"
      style={{ "--card-w": `${cardW}px`, "--card-h": `${cardH}px`, "--tint": tint }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="carousel-floor" aria-hidden="true" />
      <div className="carousel-track">
        {visible.map((i) => (
          <div
            key={items[i].id}
            ref={(el) => { if (el) els.current.set(i, el); else els.current.delete(i); }}
            className={`carousel-card${i === index ? " is-active" : ""}${i === index && onOpen ? " is-openable" : ""}`}
            onClick={() => {
              if (sim.current.moved >= 6) return;
              if (i !== index) onIndex(i);
              else if (onOpen) onOpen(items[i]);
            }}
          >
            {renderCard(items[i], { active: i === index })}
          </div>
        ))}
      </div>
    </div>
  );
}
