// Pandu – the Classifai mascot, built from your original panda code (flat shapes, no 3D layers):
// white head, black ears and eye patches with white-dot eyes, red shirt with a "P", white arms.
// Added on top: the head and eyes follow the cursor, the body follows a little, he lights up when hovered,
// and he waves with a "Hii, I'm Pandu" bubble when greeted.
import { useEffect, useRef, useState } from "react";
import "./Pandu.css";

export const PANDU_W = 230;
export const PANDU_H = 340;
export const PANDU_HEAD = { cx: 114.5, cy: 94.5, w: 165 }; // used by the fly-to-button animation

export default function Pandu({ greetKey = 0, onClick, interactive = true }) {
  const rootRef = useRef(null);
  const [hover, setHover] = useState(false);
  const [greeting, setGreeting] = useState(false);

  // Wave + smile + bubble every time greetKey changes.
  useEffect(() => {
    if (!greetKey) return undefined;
    setGreeting(true);
    const t = setTimeout(() => setGreeting(false), 3600);
    return () => clearTimeout(t);
  }, [greetKey]);

  // Head follows the cursor; the body follows a little, a beat later. The loop sleeps once everything has settled.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pointer = { x: null, y: null, last: 0 };
    const s = { nx: 0, ny: 0, bx: 0, by: 0 };
    let raf = 0;
    let last = performance.now();
    let visible = true;

    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); }, { rootMargin: "100px" });
    io.observe(root);

    let idleTimer = 0;
    const frame = (now) => {
      raf = 0;
      if (!visible) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const docked = document.documentElement.dataset.docked === "true";
      const idle = docked || pointer.x === null || now - pointer.last > 4500;
      let tx = 0;
      let ty = 0;
      if (!idle && !reduced) {
        const r = root.getBoundingClientRect();
        const cx = r.left + r.width * 0.5;
        const cy = r.top + r.height * 0.28;
        tx = Math.tanh(((pointer.x - cx) / 460) * 1.7);
        ty = Math.tanh(((pointer.y - cy) / 340) * 1.7);
      }
      const k = 1 - Math.exp(-dt * 9);
      const kb = 1 - Math.exp(-dt * 4);
      s.nx += (tx - s.nx) * k;
      s.ny += (ty - s.ny) * k;
      s.bx += (s.nx - s.bx) * kb;
      s.by += (s.ny - s.by) * kb;
      root.style.setProperty("--nx", s.nx.toFixed(3));
      root.style.setProperty("--ny", s.ny.toFixed(3));
      root.style.setProperty("--bx", s.bx.toFixed(3));
      root.style.setProperty("--by", s.by.toFixed(3));
      // keep going only while something is still moving – otherwise the loop sleeps until the cursor moves again
      const moving = Math.abs(tx - s.nx) > 0.002 || Math.abs(ty - s.ny) > 0.002 || Math.abs(s.nx - s.bx) > 0.002 || Math.abs(s.ny - s.by) > 0.002;
      if (moving) raf = requestAnimationFrame(frame);
    };
    function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }

    const onMove = (e) => {
      pointer.x = e.clientX; pointer.y = e.clientY; pointer.last = performance.now(); kick();
      clearTimeout(idleTimer);
      idleTimer = setTimeout(kick, 4600);   // wake once to let the head drift back to centre
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    kick();
    return () => { cancelAnimationFrame(raf); clearTimeout(idleTimer); io.disconnect(); window.removeEventListener("pointermove", onMove); };
  }, []);

  return (
    <div
      ref={rootRef}
      className={`pandu${hover ? " is-hover" : ""}${greeting ? " is-greeting" : ""}`}
      style={{ width: PANDU_W, height: PANDU_H }}
    >
      <div className="pd-bob">
        <div className="pd-ground" />
        <div className="pd-torso">
          <span className="pd-arm pd-arm-l" />
          <span className="pd-arm pd-arm-r" />
          <div className="pd-body">
            <span className="pd-collar" />
            <span className="pd-p" aria-hidden="true">P</span>
          </div>
        </div>

        <div className="pd-head-wrap">
          <span className="pd-ear pd-ear-l" />
          <span className="pd-ear pd-ear-r" />
          <div className="pd-head">
            <div className="pd-face">
              <span className="pd-patch pd-patch-l"><i /></span>
              <span className="pd-patch pd-patch-r"><i /></span>
              <span className="pd-nose" />
              <span className="pd-mouth" />
            </div>
          </div>
        </div>

        <div className="pd-bubble" role="status" aria-live="polite">Hii, I'm <em>Pandu</em></div>

        {interactive && (
          <button
            type="button"
            className="pd-hit"
            aria-label="Chat with Pandu"
            onPointerEnter={() => setHover(true)}
            onPointerLeave={() => setHover(false)}
            onFocus={() => setHover(true)}
            onBlur={() => setHover(false)}
            onClick={onClick}
          />
        )}
      </div>
    </div>
  );
}

// A flat little Pandu face for chat bubbles and buttons (same look as the big one).
export function PanduFace({ size = 36, className = "" }) {
  return (
    <svg className={`pandu-face-icon ${className}`} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="22" cy="22" r="16" fill="#181719" />
      <circle cx="78" cy="22" r="16" fill="#181719" />
      <path d="M50 94C26 94 8 78 8 56 8 36 26 20 50 20s42 16 42 36c0 22-18 38-42 38Z" fill="#fffaf4" stroke="#f1e8e4" strokeWidth="2" />
      <ellipse cx="32" cy="52" rx="10.5" ry="14" fill="#252124" transform="rotate(20 32 52)" />
      <ellipse cx="68" cy="52" rx="10.5" ry="14" fill="#252124" transform="rotate(-20 68 52)" />
      <ellipse cx="33" cy="49" rx="4.2" ry="5" fill="#fff" />
      <ellipse cx="67" cy="49" rx="4.2" ry="5" fill="#fff" />
      <ellipse cx="50" cy="68" rx="5.5" ry="3.8" fill="#171416" />
      <path d="M50 71v5M43.5 76.5q6.5 5 13 0" stroke="#171416" strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}
