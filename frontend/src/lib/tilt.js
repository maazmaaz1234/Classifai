// Glass panels lean a few degrees toward the cursor and catch a moving highlight, like the panels in the reference.
//
// One pointer listener serves the whole site. It finds the panel under the cursor, works out where on the panel the
// cursor is, and eases three CSS variables (--rx, --ry, --s) plus the highlight position (--mx, --my, --glare) on
// that one element. The CSS in App.css turns them into a transform, so the browser does the drawing on the GPU.
// Nothing runs while the cursor is away: the loop sleeps as soon as every panel is back at rest.
//
// Panels opt in by being `.glass.depth`, `.auth-card`, or by carrying a data-tilt attribute (data-tilt="9" sets the
// strongest lean, in degrees). Big panels lean less than small ones so nothing swings wildly.

const SELECTOR = ".glass.depth, .auth-card, [data-tilt]";

export function initTilt() {
  if (typeof window === "undefined") return () => {};
  if (window.matchMedia("(prefers-reduced-motion: reduce), (hover: none)").matches) return () => {};

  const live = new Map();   // element → { tx, ty, x, y, hover, rect, max }
  let current = null;
  let raf = 0;

  const maxFor = (el) => {
    const set = parseFloat(el.dataset.tilt);
    if (set > 0) return set;
    const w = Math.max(el.offsetWidth, 1);
    return Math.min(8, Math.max(2.6, 2500 / w));   // 300px wide → 8°, 700px → 3.6°, 1000px → 2.6°
  };

  const frame = () => {
    raf = 0;
    let moving = false;
    live.forEach((st, el) => {
      st.x += (st.tx - st.x) * 0.14;
      st.y += (st.ty - st.y) * 0.14;
      const rest = !st.hover && Math.abs(st.x) < 0.004 && Math.abs(st.y) < 0.004;
      if (rest) {
        el.style.removeProperty("--rx"); el.style.removeProperty("--ry"); el.style.removeProperty("--s");
        el.style.removeProperty("--glare");
        el.removeAttribute("data-tilting");
        live.delete(el);
        return;
      }
      const g = st.hover ? 1 : Math.min(1, Math.hypot(st.x, st.y) * 1.6);
      el.style.setProperty("--ry", `${(st.x * st.max).toFixed(2)}deg`);
      el.style.setProperty("--rx", `${(-st.y * st.max * 0.85).toFixed(2)}deg`);
      el.style.setProperty("--s", (1 + g * 0.012).toFixed(4));
      el.style.setProperty("--glare", g.toFixed(3));
      moving = true;
    });
    if (moving || live.size) raf = requestAnimationFrame(frame);
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

  const leave = (el) => {
    const st = live.get(el);
    if (!st) return;
    st.hover = false;
    st.tx = 0;
    st.ty = 0;
    kick();
  };
  const enter = (el) => {
    let st = live.get(el);
    if (!st) {
      st = { tx: 0, ty: 0, x: 0, y: 0, hover: true, rect: null, max: maxFor(el) };
      live.set(el, st);
      el.setAttribute("data-tilting", "");
    }
    st.hover = true;
    st.rect = el.getBoundingClientRect();
    st.max = maxFor(el);
    return st;
  };

  const onMove = (e) => {
    const el = e.target instanceof Element ? e.target.closest(SELECTOR) : null;
    if (el !== current) {
      if (current) leave(current);
      current = el;
      if (el) enter(el);
    }
    if (!el) return;
    const st = live.get(el) || enter(el);
    if (!st.rect) st.rect = el.getBoundingClientRect();
    const r = st.rect;
    const px = (e.clientX - r.left) / Math.max(r.width, 1);
    const py = (e.clientY - r.top) / Math.max(r.height, 1);
    st.tx = Math.max(-1, Math.min(1, (px - 0.5) * 2));
    st.ty = Math.max(-1, Math.min(1, (py - 0.5) * 2));
    el.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
    el.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
    kick();
  };
  const onOut = (e) => { if (!e.relatedTarget && current) { leave(current); current = null; } };
  const onScroll = () => { live.forEach((st) => { st.rect = null; }); };

  window.addEventListener("pointermove", onMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", onOut);
  window.addEventListener("scroll", onScroll, { passive: true });
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("pointermove", onMove);
    document.documentElement.removeEventListener("pointerleave", onOut);
    window.removeEventListener("scroll", onScroll);
    live.forEach((_, el) => { el.removeAttribute("data-tilting"); ["--rx", "--ry", "--s", "--glare"].forEach((p) => el.style.removeProperty(p)); });
    live.clear();
  };
}
