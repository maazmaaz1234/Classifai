import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "../svm.css";
import { Words } from "../components/Words";
import { PanduFace } from "../components/Pandu";
import { FEATURES, METRICS, MODEL, STEPS } from "../lib/modelInfo";

// "Under the hood": the SVM drawn as a map of customers, the pipeline, the headline metrics and the permutation importances.
// Every number comes from lib/modelInfo.js, the same file Pandu reads, so the page and the chat never disagree.
// The map is a teaching picture with made-up points (it does not use your customers): drag the glowing dot around, or
// flip the kernel, to see how the boundary, the margin and the support vectors react.
const TOP = FEATURES[0][1];

// true while the element is on screen (once = stay true after the first time)
function useInView(ref, once = false) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setSeen(true); return undefined; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setSeen(true); if (once) io.disconnect(); } else if (!once) setSeen(false);
    }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, once]);
  return seen;
}

function Counter({ to, suffix, run }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setV(to); return undefined; }
    const t0 = performance.now();
    let raf = 0;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / 1500);
      setV(to * (1 - Math.pow(1 - p, 4)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [run, to]);
  return <>{to < 1 ? v.toFixed(2) : v.toFixed(1)}{suffix}</>;
}

// ── the picture ────────────────────────────────────────────────────────────────
// x = months with us (0–72), y = monthly bill (20–120). Leavers sit top-left (new and paying a lot), stayers bottom-right.
const W = 420, H = 280, X0 = 38, X1 = 408, Y0 = 14, Y1 = 242;
const T_MAX = 72, C_MIN = 20, C_MAX = 120;
const px = (t) => X0 + (t / T_MAX) * (X1 - X0);
const py = (c) => Y1 - ((c - C_MIN) / (C_MAX - C_MIN)) * (Y1 - Y0);
const unx = (x) => ((x - X0) / (X1 - X0)) * T_MAX;
const uny = (y) => C_MIN + ((Y1 - y) / (Y1 - Y0)) * (C_MAX - C_MIN);
const clampN = (v, a, b) => Math.min(b, Math.max(a, v));

const MARGIN = 11;                                     // half-width of the street, in dollars
const curved = (t) => 32 + 76 * (1 - Math.exp(-t / 24)) + 8 * Math.sin(t / 10.5);   // the "real" frontier (what RBF can follow)
const straight = (t) => 42 + 0.82 * t;                                                // the best a straight line can do
const KERNELS = { rbf: { label: "RBF kernel", f: curved }, linear: { label: "Linear kernel", f: straight } };

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

const POINTS = (() => {
  const r = rng(77);
  return Array.from({ length: 66 }, () => {
    const t = clampN(T_MAX * Math.pow(r(), 1.15), 1.5, T_MAX - 1.5);
    const d = gauss(r) * 21;
    const c = clampN(curved(t) + d, C_MIN + 3, C_MAX - 3);
    return { t, c, leave: d + gauss(r) * 5 > 0 };
  });
})();

const PERSONAS = [
  { id: "new", label: "New, big bill", t: 5, c: 98 },
  { id: "fence", label: "On the fence", t: 24, c: 72 },
  { id: "loyal", label: "Loyal, small bill", t: 62, c: 44 },
];

const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const STEPS_X = Array.from({ length: 37 }, (_, i) => (i / 36) * T_MAX);

function pathOf(f, shift = 0) {
  return STEPS_X.map((t, i) => `${i ? "L" : "M"}${px(t).toFixed(1)} ${py(clampN(f(t) + shift, C_MIN - 20, C_MAX + 20)).toFixed(1)}`).join("");
}
function bandOf(f) {
  const up = STEPS_X.map((t, i) => `${i ? "L" : "M"}${px(t).toFixed(1)} ${py(f(t) + MARGIN).toFixed(1)}`).join("");
  const down = [...STEPS_X].reverse().map((t) => `L${px(t).toFixed(1)} ${py(f(t) - MARGIN).toFixed(1)}`).join("");
  return `${up}${down}Z`;
}

function SvmMap({ running }) {
  const [kernel, setKernel] = useState("rbf");
  const [mix, setMix] = useState(0);                         // 0 = RBF boundary … 1 = straight boundary (animated)
  const [dot, setDot] = useState({ t: PERSONAS[1].t, c: PERSONAS[1].c });
  const [persona, setPersona] = useState("fence");
  const [drag, setDrag] = useState(false);
  const svgRef = useRef(null);
  const mixRef = useRef(0);
  const idx = useRef(1);

  // morph the boundary when the kernel changes (≈ 450 ms)
  useEffect(() => {
    const to = kernel === "linear" ? 1 : 0;
    const from = mixRef.current;
    if (from === to) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { mixRef.current = to; setMix(to); return undefined; }
    const t0 = performance.now();
    let raf = 0;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / 450);
      const e = 1 - Math.pow(1 - p, 3);
      mixRef.current = from + (to - from) * e;
      setMix(mixRef.current);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [kernel]);

  const f = useCallback((t) => curved(t) * (1 - mix) + straight(t) * mix, [mix]);
  const boundary = useMemo(() => pathOf(f), [f]);
  const band = useMemo(() => bandOf(f), [f]);
  const leaveSide = useMemo(() => `${boundary}L${X1} ${Y0}L${X0} ${Y0}Z`, [boundary]);

  const marks = useMemo(() => POINTS.map((p) => {
    const d = p.c - f(p.t);
    const wrong = (d > 0) !== p.leave;
    return { ...p, wrong, sv: Math.abs(d) < MARGIN || wrong };
  }), [f]);
  const svCount = marks.filter((m) => m.sv).length;
  const mistakes = marks.filter((m) => m.wrong).length;

  const d = dot.c - f(dot.t);
  const prob = sigmoid(d / 6);
  const leaves = prob >= 0.5;
  const inMargin = Math.abs(d) < MARGIN;

  const move = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * H;
    setDot({ t: clampN(unx(x), 1, T_MAX - 1), c: clampN(uny(y), C_MIN + 2, C_MAX - 2) });
    setPersona("");
  };

  // while nobody is touching it, the dot wanders between the three example customers
  useEffect(() => {
    if (!running || drag) return undefined;
    const id = setInterval(() => {
      idx.current = (idx.current + 1) % PERSONAS.length;
      const n = PERSONAS[idx.current];
      setPersona(n.id);
      setDot({ t: n.t, c: n.c });
    }, 4600);
    return () => clearInterval(id);
  }, [running, drag]);

  const pick = (p) => { idx.current = PERSONAS.indexOf(p); setPersona(p.id); setDot({ t: p.t, c: p.c }); };

  return (
    <>
      <div className="model-map-head">
        <span className="mono">The SVM, drawn as a map</span>
        <div className="seg" role="group" aria-label="Kernel">
          {Object.entries(KERNELS).map(([k, v]) => <button key={k} type="button" aria-pressed={kernel === k} onClick={() => setKernel(k)}>{v.label}</button>)}
        </div>
      </div>

      <svg
        ref={svgRef}
        className={`svm-map${drag ? " is-drag" : ""}${running ? " is-on" : ""}`}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Customers plotted by months with us and monthly bill. The SVM boundary separates likely leavers from likely stayers. The highlighted customer is ${Math.round(prob * 100)} percent likely to churn.`}
        onPointerMove={(e) => { if (drag) move(e); }}
        onPointerUp={() => setDrag(false)}
        onPointerCancel={() => setDrag(false)}
      >
        <defs>
          <linearGradient id="svm-stay" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6ee7b7" stopOpacity="0" /><stop offset="1" stopColor="#6ee7b7" stopOpacity="0.1" /></linearGradient>
          <linearGradient id="svm-leave" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#ff3b52" stopOpacity="0" /><stop offset="1" stopColor="#ff3b52" stopOpacity="0.14" /></linearGradient>
          <clipPath id="svm-clip"><rect x={X0} y={Y0} width={X1 - X0} height={Y1 - Y0} rx="6" /></clipPath>
        </defs>
        <g clipPath="url(#svm-clip)">
          <rect x={X0} y={Y0} width={X1 - X0} height={Y1 - Y0} fill="url(#svm-stay)" />
          <path d={leaveSide} className="svm-leave-side" fill="url(#svm-leave)" />
          <path d={band} className="svm-street" />
          <path d={boundary} className="svm-line" />
          {marks.map((m, i) => (
            <g key={i} transform={`translate(${px(m.t).toFixed(1)} ${py(m.c).toFixed(1)})`}>
              {m.sv && <circle className="svm-sv" r="8.5" />}
              <circle className={`svm-pt ${m.leave ? "is-leave" : "is-stay"}${m.wrong ? " is-wrong" : ""}`} r="3.6" />
            </g>
          ))}
        </g>
        <g className="svm-axis">
          <path d={`M${X0} ${Y0}V${Y1}H${X1}`} />
          <text x={X1} y={H - 8} textAnchor="end">Months with us →</text>
          <text x="10" y={Y0 + 6} transform={`rotate(-90 10 ${Y0 + 6})`} textAnchor="end">Monthly bill →</text>
        </g>
        <g
          className={`svm-you${leaves ? " is-leave" : ""}`}
          transform={`translate(${px(dot.t).toFixed(1)} ${py(dot.c).toFixed(1)})`}
          onPointerDown={(e) => { e.currentTarget.ownerSVGElement.setPointerCapture?.(e.pointerId); setDrag(true); move(e); }}
          tabIndex={0}
          role="slider"
          aria-label="A new customer. Drag, or use the arrow keys, to move them"
          aria-valuetext={`${Math.round(prob * 100)} percent likely to churn`}
          aria-valuenow={Math.round(prob * 100)}
          onKeyDown={(e) => {
            const k = { ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, 3], ArrowDown: [0, -3] }[e.key];
            if (!k) return;
            e.preventDefault();
            setPersona("");
            setDot((o) => ({ t: clampN(o.t + k[0], 1, T_MAX - 1), c: clampN(o.c + k[1], C_MIN + 2, C_MAX - 2) }));
          }}
        >
          <circle className="svm-you-halo" r="15" />
          <circle className="svm-you-core" r="6.5" />
        </g>
      </svg>

      <div className="svm-readout" aria-live="polite">
        <div className={`svm-verdict${leaves ? " is-leave" : ""}`}>
          <strong>{Math.round(prob * 100)}%</strong>
          <span>{leaves ? "likely to churn" : "likely to stay"}</span>
        </div>
        <p>
          {inMargin ? "Close to the boundary, so the SVM is unsure. These are the customers worth a call." : leaves ? "Far on the leaving side of the boundary, so the score is high." : "Far on the staying side of the boundary, so the score is low."}
        </p>
      </div>

      <div className="svm-chips">
        {PERSONAS.map((p) => <button key={p.id} type="button" className={`chip${persona === p.id ? " is-on" : ""}`} onClick={() => pick(p)}>{p.label}</button>)}
      </div>

      <div className="svm-legend">
        <span><i className="dot leave" /> Left</span>
        <span><i className="dot stay" /> Stayed</span>
        <span><i className="svm-ring" /> {svCount} support vectors</span>
        <span className={mistakes ? "is-warn" : ""}>{mistakes} wrong on this map</span>
      </div>
    </>
  );
}

export default function Model({ onAsk }) {
  const mapRef = useRef(null);
  const statsRef = useRef(null);
  const mapOn = useInView(mapRef);
  const statsSeen = useInView(statsRef, true);

  return (
    <section id="model" className="page page-model" aria-label="About the model" data-active="false">
      <div className="page-inner">
        <p className="eyebrow depth" style={{ "--i": 0 }}>Under the hood</p>
        <h2 className="page-title model-title depth" style={{ "--i": 0 }}>
          <span className="hero-line"><Words text="A boundary that" /></span>
          <span className="hero-line"><Words text="separates churn." start={3} className="ital" /></span>
        </h2>

        <div className="model-grid">
          <div ref={mapRef} className="glass model-map depth" style={{ "--i": 1 }}>
            <SvmMap running={mapOn} />
          </div>

          <ol className="model-steps">
            {STEPS.map(([n, t, d], i) => (
              <li key={n} className="glass model-step depth" style={{ "--i": 1 + i * 0.4 }}>
                <span className="model-step-n">{n}</span>
                <div><h3>{t}</h3><p>{d}</p></div>
              </li>
            ))}
          </ol>
        </div>

        <div ref={statsRef} className={`model-stats${statsSeen ? " is-on" : ""}`}>
          <div className="model-metrics">
            {METRICS.map(([k, v, s]) => (
              <div key={k} className="glass model-metric depth" data-tilt="7">
                <div className="model-metric-v"><Counter to={v} suffix={s} run={statsSeen} /></div>
                <div className="mono">{k}</div>
              </div>
            ))}
          </div>
          <div className="glass model-importance depth">
            <div className="model-map-head">
              <span className="mono">Feature importance (permutation)</span>
              <button type="button" className="chip chip-pandu" onClick={() => onAsk("What does feature importance mean for an SVM?")}>
                <PanduFace size={20} /> Explain this
              </button>
            </div>
            {FEATURES.map(([n, v], i) => (
              <div key={n} className="fi-row" style={{ "--d": `${i * 90}ms` }}>
                <span className="fi-name">{n}</span>
                <span className="fi-track"><span className="fi-bar" style={{ "--w": `${(v / TOP) * 100}%` }} /></span>
                <span className="fi-v mono">{(v * 100).toFixed(0)}%</span>
              </div>
            ))}
            <p className="model-foot mono">{MODEL.algorithm} · {MODEL.kernel} kernel · C = {MODEL.C} · {MODEL.supportVectors.toLocaleString()} support vectors</p>
          </div>
        </div>
      </div>
    </section>
  );
}
