// Pandu on the Home page is big. When you scroll down or open another page he flies up
// and becomes the "Ask Pandu" button; when you come back he flies back down, waves and says hi.
// The position is driven by a critically-damped spring (no CSS transitions), so the flight can reverse
// smoothly even if you change your mind half-way. The loop sleeps whenever nothing is moving.
import { useEffect, useRef, useState } from "react";
import Pandu, { PANDU_W, PANDU_H, PANDU_HEAD } from "./Pandu";
import { clamp, lerp, smoothstep } from "../lib/format";

export default function PanduFlight({ docked, ready = true, onOpenChat }) {
  const wrapRef = useRef(null);
  const [greetKey, setGreetKey] = useState(0);
  const sim = useRef({ t: 0, v: 0, target: 0, far: false });
  const kickRef = useRef(() => {});

  useEffect(() => { sim.current.target = docked ? 1 : 0; kickRef.current(); }, [docked]);

  // Say hi shortly after the page appears.
  useEffect(() => {
    if (!ready) return undefined;
    const id = setTimeout(() => setGreetKey((k) => k + 1), 500);
    return () => clearTimeout(id);
  }, [ready]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = performance.now();
    let dirty = true;
    let lastFly = -1;
    const topbar = document.querySelector(".topbar");   // --fly only matters to the Ask pill, so set it there (not on <html>)

    const frame = (now) => {
      raf = 0;
      const dt = Math.min(0.04, (now - last) / 1000);
      last = now;
      const s = sim.current;
      if (reduced) { s.t = s.target; s.v = 0; }
      else {
        const k = 62;                     // stiffness
        const c = 2 * Math.sqrt(k);       // critical damping: fast, no wobble
        s.v += (-k * (s.t - s.target) - c * s.v) * dt;
        s.t += s.v * dt;
      }
      const t = clamp(s.t, 0, 1);
      const moving = Math.abs(s.t - s.target) > 0.0008 || Math.abs(s.v) > 0.002;

      const hero = document.getElementById("pandu-slot");
      const ask = document.getElementById("ask-slot");
      if (hero && ask) {
        const hr = hero.getBoundingClientRect();
        const ar = ask.getBoundingClientRect();
        const s0 = hr.width / PANDU_W;
        const s1 = ar.width / PANDU_HEAD.w;
        const x0 = hr.left;
        const y0 = hr.top;
        const x1 = ar.left + ar.width / 2 - s1 * PANDU_HEAD.cx;
        const y1 = ar.top + ar.height / 2 - s1 * PANDU_HEAD.cy;
        const swing = Math.sin(Math.PI * t) * Math.min(140, window.innerWidth * 0.09);
        const x = lerp(x0, x1, t) - swing;
        const y = lerp(y0, y1, t);
        const sc = lerp(s0, s1, smoothstep(0, 1, t));
        wrap.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${sc.toFixed(4)})`;
        wrap.style.setProperty("--body", (1 - smoothstep(0.28, 0.82, t)).toFixed(3));
        wrap.style.visibility = hr.width > 0 || t > 0.5 ? "visible" : "hidden";
        const fly = smoothstep(0.62, 1, t).toFixed(3);
        if (fly !== lastFly) { (topbar || document.documentElement).style.setProperty("--fly", fly); lastFly = fly; }
      }

      // Back home → wave.
      if (t > 0.6) s.far = true;
      if (s.far && s.target === 0 && t < 0.04) { s.far = false; setGreetKey((n) => n + 1); }

      const wasDirty = dirty;
      dirty = false;
      if (moving || wasDirty) raf = requestAnimationFrame(frame);
    };
    const kick = () => { dirty = true; if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    kickRef.current = kick;

    window.addEventListener("scroll", kick, { passive: true });
    window.addEventListener("resize", kick);
    kick();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", kick); window.removeEventListener("resize", kick); };
  }, []);

  return (
    <div ref={wrapRef} className={`pandu-fly${docked ? " is-docked" : ""}`} style={{ width: PANDU_W, height: PANDU_H }}>
      <Pandu greetKey={greetKey} onClick={onOpenChat} />
    </div>
  );
}
