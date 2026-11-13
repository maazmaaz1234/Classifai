// Small hand-made SVG charts (no chart library needed): sparkline, forecast line chart, risk ring.
import { useEffect, useId, useRef, useState } from "react";

export function useSize(ref) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setSize((s) => (Math.abs(s.w - width) < 1 && Math.abs(s.h - height) < 1 ? s : { w: width, h: height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

// smooth line through points (cardinal spline → cubic bezier)
function smooth(pts, t = 0.5) {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + ((p2[0] - p0[0]) * t) / 3, p1[1] + ((p2[1] - p0[1]) * t) / 3];
    const c2 = [p2[0] - ((p3[0] - p1[0]) * t) / 3, p2[1] - ((p3[1] - p1[1]) * t) / 3];
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

export function Sparkline({ values, color = "var(--red)", height = 38, label }) {
  const ref = useRef(null);
  const gid = useId().replace(/:/g, "");
  const { w } = useSize(ref);
  const n = values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 4;
  const pts = values.map((v, i) => [pad + (i / Math.max(1, n - 1)) * Math.max(0, w - pad * 2), height - pad - ((v - min) / span) * (height - pad * 2)]);
  const line = smooth(pts);
  const last = pts[pts.length - 1];
  return (
    <div ref={ref} className="spark" role="img" aria-label={label}>
      {w > 0 && n > 1 && (
        <svg width={w} height={height}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.35" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient>
          </defs>
          <path d={`${line}L${last[0]},${height}L${pts[0][0]},${height}Z`} fill={`url(#${gid})`} />
          <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" pathLength="1" className="draw" />
          <circle cx={last[0]} cy={last[1]} r="3.4" fill={color} /><circle cx={last[0]} cy={last[1]} r="7" fill={color} opacity="0.25" className="pulse" />
        </svg>
      )}
    </div>
  );
}

const niceMax = (v) => {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return n * p;
};

/**
 * series: [{ name, color, values[] }]  (same length, index = month)
 * labels: x labels per index. format(v) → text for the tooltip / axis.
 */
export function LineChart({ series, labels, format = (v) => String(Math.round(v)), height = 270, area = true, ariaLabel }) {
  const wrap = useRef(null);
  const gid = useId().replace(/:/g, "");
  const { w } = useSize(wrap);
  const [hover, setHover] = useState(null);
  const n = labels.length;
  const m = { l: 46, r: 18, t: 18, b: 32 };
  const iw = Math.max(0, w - m.l - m.r);
  const ih = height - m.t - m.b;
  const max = niceMax(Math.max(...series.flatMap((s) => s.values)) * 1.08);
  const x = (i) => m.l + (i / (n - 1)) * iw;
  const y = (v) => m.t + ih - (v / max) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const step = n > 8 ? 2 : 1;

  const onMove = (e) => {
    const r = wrap.current.getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = Math.round(((px - m.l) / iw) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <div ref={wrap} className="chart" style={{ height }} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={ariaLabel}>
      {w > 0 && (
        <svg width={w} height={height}>
          <defs>
            {series.map((s, k) => (
              <linearGradient key={k} id={`${gid}${k}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={s.color} stopOpacity="0.34" /><stop offset="1" stopColor={s.color} stopOpacity="0" /></linearGradient>
            ))}
          </defs>
          {ticks.map((t, k) => (
            <g key={k}>
              <line x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeDasharray={k === 0 ? "0" : "3 5"} />
              <text x={m.l - 10} y={y(t) + 4} textAnchor="end" className="chart-tick">{format(t)}</text>
            </g>
          ))}
          {labels.map((l, i) => (i % step === 0 || i === n - 1) && (
            <text key={i} x={x(i)} y={height - 8} textAnchor="middle" className="chart-tick">{l}</text>
          ))}
          {series.map((s, k) => {
            const pts = s.values.map((v, i) => [x(i), y(v)]);
            const d = smooth(pts);
            return (
              <g key={s.name + k}>
                {area && series.length === 1 && <path d={`${d}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill={`url(#${gid}${k})`} className="chart-area" />}
                <path d={d} fill="none" stroke={s.color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" pathLength="1" className="draw" style={{ animationDelay: `${k * 120}ms` }} />
              </g>
            );
          })}
          {hover !== null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={m.t + ih} stroke="rgba(255,255,255,0.4)" strokeDasharray="3 4" />
              {series.map((s, k) => <circle key={k} cx={x(hover)} cy={y(s.values[hover])} r="5" fill="#120609" stroke={s.color} strokeWidth="2.5" />)}
            </g>
          )}
        </svg>
      )}
      {hover !== null && w > 0 && (
        <div className="chart-tip" style={{ left: Math.min(w - 170, Math.max(8, x(hover) - 74)), top: 6 }}>
          <strong>{labels[hover]}</strong>
          {series.map((s, k) => (
            <span key={k}><i style={{ background: s.color }} />{series.length > 1 ? `${s.name} ` : ""}<b>{format(s.values[hover])}</b></span>
          ))}
        </div>
      )}
    </div>
  );
}

export function RiskRing({ value, size = 150, label, tone = "var(--red)" }) {
  const r = (size - 16) / 2;
  const c = 2 * Math.PI * r;
  const [shown, setShown] = useState(0);
  useEffect(() => { const id = requestAnimationFrame(() => setShown(value)); return () => cancelAnimationFrame(id); }, [value]);
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${Math.round(value * 100)}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="9" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - shown)} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 1.2s var(--ease-out)", filter: `drop-shadow(0 0 8px ${tone})` }}
        />
      </svg>
      <div className="ring-mid"><strong>{Math.round(value * 100)}<small>%</small></strong>{label && <span>{label}</span>}</div>
    </div>
  );
}
