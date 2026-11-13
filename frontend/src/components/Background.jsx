// The scene behind every page: ONE ribbon of light that runs the whole length of the site, like the reference.
// Around a hundred hair-thin strands of light (red, amber and a few electric-blue and green ones) twist along a
// curve; where the ribbon turns edge-on they pile up into a white-hot bend. As you scroll, the ribbon flows into a
// new shape for each page and drifts out of focus into a soft aurora behind the panels, then comes back sharp.
//
// It is all drawn on the GPU from a handful of vertices (the curve is computed in the vertex shader), so the
// browser's main thread does nothing while you scroll. A small off-screen pass gives the bloom.
// If WebGL is missing, soft CSS glows take over so the page always has its light.
import { useEffect, useRef } from "react";
import { fx, getUI, topScene } from "../lib/ui";

const STRANDS = 80;       // hair-thin filaments
const SEGMENTS = 150;     // segments along each filament
const SPARKS = 340;       // tiny drifting particles
const SPEED = 1.38;       // how fast the light flows (the reference video flows quicker than the first version did)
const WIDE = 1.14;        // how wide the ribbon opens out on either side of its bends

// ── shaders ────────────────────────────────────────────────────────────────────────────────────────
// shared: the spine of the ribbon (a Catmull-Rom curve through 8 control points) and how strands fan around it
const RIBBON = `
uniform vec3 uCP[8];
uniform float uT;
uniform float uAsp;
uniform float uBend;
uniform float uTwist;
uniform vec2 uPar;
uniform float uWide;

float hash(float n){ return fract(sin(n * 127.1 + 311.7) * 43758.5453); }

vec3 cr(vec3 a, vec3 b, vec3 c, vec3 d, float t){
  float t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2.0 * b) + (c - a) * t + (2.0 * a - 5.0 * b + 4.0 * c - d) * t2 + (3.0 * b - a - 3.0 * c + d) * t3);
}
vec3 spine(float s){
  float f = clamp(s, 0.0, 0.9999) * 7.0;
  int i = int(f);
  float t = f - float(i);
  vec3 p0 = uCP[i == 0 ? 0 : i - 1];
  vec3 p1 = uCP[i];
  vec3 p2 = uCP[i + 1];
  vec3 p3 = uCP[i + 2 > 7 ? 7 : i + 2];
  return cr(p0, p1, p2, p3, t);
}
// a point on the ribbon: s along it (0..1), u across it (-1..1), seed makes every strand a little different
vec3 ribbonPos(float s, float u, float seed){
  vec3 c = spine(s);
  vec3 T = normalize(spine(min(s + 0.012, 1.0)) - c + vec3(1e-5));
  vec3 N = normalize(cross(T, vec3(0.0, 0.0, 1.0)) + vec3(1e-4, 1e-4, 0.0));
  vec3 B = cross(T, N);
  float d = s - uBend;
  // the ribbon is edge-on at the bend (strands pile up into one bright line) and opens up on both sides
  float tw = 1.5708 + d * uTwist + 0.22 * sin(uT * 0.13 + s * 3.0);
  float w = (0.03 + 0.4 * smoothstep(0.0, 0.34, abs(d)) + 0.12 * abs(d)) * uWide;
  u += 0.06 * sin(s * 11.0 + seed * 41.0 + uT * 0.3) + 0.03 * sin(s * 27.0 - seed * 19.0 - uT * 0.5);
  vec3 p = c + w * u * (cos(tw) * N + sin(tw) * B);
  p += 0.014 * vec3(sin(s * 13.0 + seed * 53.0 + uT * 0.27), cos(s * 9.0 + seed * 31.0 + uT * 0.22), 0.5 * sin(s * 7.0 + seed * 17.0));
  return p;
}
// to the screen: perspective, aspect correction, a touch of cursor parallax (near things move more)
vec2 project(vec3 p){
  p.xy += uPar * (0.9 - p.z * 0.6);
  float pf = 1.0 / (1.0 + p.z * 0.42);
  return vec2(p.x / uAsp, p.y) * pf;
}
vec3 strandColor(float u, float h){
  float a = abs(u);
  vec3 cool = mix(vec3(0.16, 0.5, 1.0), vec3(0.22, 0.86, 1.0), h);      // electric blue to cyan: a thin core
  vec3 gold = mix(vec3(1.0, 0.5, 0.08), vec3(1.0, 0.78, 0.24), h);       // amber to yellow
  vec3 hot  = mix(vec3(1.0, 0.07, 0.22), vec3(1.0, 0.3, 0.14), h);      // crimson to orange: most of the ribbon
  vec3 c = mix(cool, gold, smoothstep(0.05, 0.09, a));
  c = mix(c, hot, smoothstep(0.17, 0.3, a));
  c = mix(c, vec3(0.5, 1.0, 0.42), step(0.95, hash(h * 91.7)) * 0.9);   // the odd green filament
  return c;
}
`;

const STRAND_VS = `
precision highp float;
attribute vec4 aA;          // s along, strand 0..1, side -1/1, random
uniform vec2 uRes;
uniform float uPx;          // half-width of a filament, in pixels of the current target
uniform float uI;
uniform float uBendGain;
varying vec3 vCol;
varying float vV;
${RIBBON}
void main(){
  float s = aA.x;
  float seed = aA.w;
  float u = aA.y * 2.0 - 1.0;
  vec3 P = ribbonPos(s, u, seed);
  vec2 a = project(P);
  vec2 b = project(ribbonPos(min(s + 0.006, 1.0), u, seed));
  vec2 tp = (b - a) * uRes * 0.5;
  vec2 n = normalize(vec2(-tp.y, tp.x) + vec2(1e-5));
  float wv = uPx * (0.55 + 0.9 * hash(seed * 7.7));
  vec2 pos = a + n * aA.z * wv * 2.0 / uRes;
  gl_Position = vec4(pos, 0.0, 1.0);
  float d = s - uBend;
  float boost = 1.0 + uBendGain * exp(-d * d / 0.0075);
  float fade = smoothstep(0.0, 0.1, s) * (1.0 - smoothstep(0.86, 1.0, s));
  float pulse = 0.58 + 0.42 * sin(s * 24.0 - uT * 1.5 + seed * 30.0);
  float near = 1.12 - 0.3 * clamp(P.z, -0.6, 1.6);
  vCol = strandColor(u, hash(seed * 5.3)) * uI * fade * boost * pulse * near * (0.3 + 1.2 * hash(seed * 3.1));
  vV = aA.z;
}`;

const STRAND_FS = `
precision mediump float;
varying vec3 vCol;
varying float vV;
void main(){
  float prof = exp(-vV * vV * 3.4);
  gl_FragColor = vec4(vCol * prof, 1.0);
}`;

const SPARK_VS = `
precision highp float;
attribute vec4 aA;          // s start, across, size, phase
uniform vec2 uRes;
uniform float uI;
uniform float uPt;          // pixel scale of the canvas
varying vec3 vCol;
varying float vA;
${RIBBON}
void main(){
  float s = fract(aA.x + uT * 0.011 * (0.4 + aA.z));
  float seed = aA.w;
  vec3 P = ribbonPos(s, aA.y * 1.5, seed) + 0.05 * vec3(sin(uT * 0.4 + seed * 90.0), cos(uT * 0.33 + seed * 70.0), 0.0);
  gl_Position = vec4(project(P), 0.0, 1.0);
  gl_PointSize = (1.3 + 3.2 * aA.z * aA.z) * uPt;
  float fade = smoothstep(0.0, 0.1, s) * (1.0 - smoothstep(0.86, 1.0, s));
  float tw = 0.25 + 0.75 * pow(0.5 + 0.5 * sin(uT * (0.8 + aA.z) + aA.w * 60.0), 2.0);
  vA = uI * fade * tw;
  vCol = mix(strandColor(aA.y, hash(seed * 5.3)), vec3(1.0), 0.35);
}`;

const SPARK_FS = `
precision mediump float;
varying vec3 vCol;
varying float vA;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = clamp(1.0 - d, 0.0, 1.0);
  gl_FragColor = vec4(vCol * vA * a * a, 1.0);
}`;

const COMP_VS = `
attribute vec4 aA;
varying vec2 vUv;
void main(){ vUv = aA.xy * 0.5 + 0.5; gl_Position = vec4(aA.xy, 0.0, 1.0); }`;

const COMP_FS = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uK;
uniform float uR;
void main(){
  vec3 c = texture2D(uTex, vUv).rgb * 0.3;
  vec2 o = uTexel * uR * vec2(1.45, 1.0);       // the glow spreads a little further left and right than up and down
  c += (texture2D(uTex, vUv + vec2(o.x, 0.0)).rgb + texture2D(uTex, vUv - vec2(o.x, 0.0)).rgb) * 0.16
     + (texture2D(uTex, vUv + vec2(0.0, o.y)).rgb + texture2D(uTex, vUv - vec2(0.0, o.y)).rgb) * 0.10;
  c += (texture2D(uTex, vUv + o).rgb + texture2D(uTex, vUv - o).rgb
      + texture2D(uTex, vUv + vec2(o.x, -o.y)).rgb + texture2D(uTex, vUv + vec2(-o.x, o.y)).rgb) * 0.045;
  gl_FragColor = vec4(c * uK, 1.0);
}`;

// ── the shape of the ribbon on each page ───────────────────────────────────────────────────────────
// 8 control points per scene: x in −1…1 (width), y in −1…1 (height, up is +), z = depth (bigger is further).
// bend = where along the ribbon it turns edge-on, gain = how white-hot that bend gets, blur 0…1 = sharp strands
// to soft aurora, i = overall brightness.
const SCENES = [
  { // Home – the hook: down from the top right, a tight bright turn behind Pandu, away to the bottom right
    cp: [[1.6, 1.5, 1.3], [1.25, 1.1, 1.0], [0.88, 0.7, 0.62], [0.36, 0.22, 0.25], [-0.02, -0.14, -0.14], [-0.04, -0.52, -0.2], [0.5, -0.86, 0.1], [1.25, -1.1, 0.7]],
    bend: 0.5, gain: 1.7, blur: 0.0, i: 1.05,
  },
  { // Customers – the ribbon runs along the bottom and up the right edge, drifting out of focus; the tiles stay clear
    cp: [[-1.6, -0.78, 1.1], [-1.05, -1.0, 0.8], [-0.35, -1.02, 0.5], [0.4, -0.92, 0.3], [1.0, -0.55, 0.1], [1.22, 0.1, 0.0], [1.05, 0.78, 0.25], [0.6, 1.4, 0.7]],
    bend: 0.58, gain: 1.2, blur: 0.62, i: 0.85,
  },
  { // Dashboard – a "C" that hugs the top and the left edge: it enters at the top right, runs along the top, turns white-hot in the top-left corner and drops away at the bottom left
    cp: [[1.7, 1.0, 1.2], [1.0, 1.16, 0.8], [0.2, 1.26, 0.5], [-0.72, 1.18, 0.25], [-1.22, 0.8, 0.1], [-1.38, 0.0, 0.05], [-1.16, -0.82, 0.25], [-0.5, -1.45, 0.7]],
    bend: 0.52, gain: 1.15, blur: 0.55, i: 0.8,
  },
  { // Model – a bending line across the whole screen, bottom left to top right, like a decision boundary; it turns bright through the middle
    cp: [[-1.75, -1.0, 1.1], [-1.2, -1.12, 0.8], [-0.55, -0.72, 0.45], [-0.08, -0.16, 0.18], [0.3, 0.26, 0.05], [0.78, 0.58, 0.1], [1.22, 0.5, 0.35], [1.75, 0.98, 0.8]],
    bend: 0.5, gain: 1.35, blur: 0.58, i: 0.8,
  },
  { // Support – the hook flipped: up from the bottom right, a bright turn between the headline and the questions, off the top right
    cp: [[1.6, -1.5, 1.3], [1.25, -1.1, 1.0], [0.85, -0.75, 0.6], [0.3, -0.45, 0.25], [-0.05, -0.1, -0.14], [0.0, 0.35, -0.2], [0.5, 0.78, 0.1], [1.25, 1.12, 0.7]],
    bend: 0.5, gain: 1.6, blur: 0.22, i: 0.88,
  },
];

// Routes the ribbon takes while a window is open (see lib/ui.js → pushScene). Opening one visibly re-routes the ribbon.
const OVERRIDES = {
  enter: { // the sign-in surge: one bright, sharp line cutting across the screen
    cp: [[-1.8, -1.2, 1.0], [-1.2, -0.85, 0.6], [-0.6, -0.4, 0.3], [-0.1, -0.05, 0.05], [0.35, 0.28, 0.0], [0.85, 0.6, 0.2], [1.3, 0.95, 0.5], [1.8, 1.4, 0.9]],
    bend: 0.5, gain: 2.6, blur: 0.0, i: 1.35,
  },
  window: { // small windows (add / edit / password): a calm loop behind the sheet
    cp: [[1.6, 0.25, 1.0], [1.0, 0.7, 0.7], [0.35, 0.8, 0.4], [-0.25, 0.52, 0.2], [-0.5, 0.0, 0.1], [-0.2, -0.52, 0.2], [0.4, -0.8, 0.4], [1.05, -0.62, 0.7]],
    bend: 0.5, gain: 1.4, blur: 0.42, i: 0.92,
  },
  customers: { // Total customers: a bright arch over the card stage
    cp: [[-1.7, -1.25, 1.0], [-1.3, -0.5, 0.6], [-0.92, 0.3, 0.3], [-0.45, 0.86, 0.15], [0.12, 1.04, 0.1], [0.7, 0.86, 0.2], [1.15, 0.3, 0.4], [1.55, -0.55, 0.85]],
    bend: 0.52, gain: 1.8, blur: 0.12, i: 1.05,
  },
  atrisk: { // At-risk customers: a hot diagonal slash
    cp: [[-1.75, 1.2, 1.0], [-1.1, 0.8, 0.6], [-0.55, 0.36, 0.3], [-0.1, 0.0, 0.1], [0.3, -0.3, 0.0], [0.75, -0.66, 0.15], [1.2, -0.96, 0.4], [1.85, -1.3, 0.9]],
    bend: 0.5, gain: 2.3, blur: 0.05, i: 1.2,
  },
  profile: { // a customer's page: a ribbon down the left side and along the bottom
    cp: [[-1.3, 1.5, 1.0], [-1.22, 0.8, 0.7], [-1.04, 0.1, 0.4], [-0.9, -0.5, 0.2], [-0.5, -0.96, 0.1], [0.2, -1.1, 0.2], [0.9, -1.0, 0.5], [1.65, -0.7, 0.9]],
    bend: 0.46, gain: 1.4, blur: 0.4, i: 0.95,
  },
  chat: { // full-screen Pandu AI: a frame of light down the right edge, along the bottom and up the left edge
    cp: [[1.32, 1.5, 0.9], [1.26, 0.6, 0.5], [1.2, -0.3, 0.25], [0.9, -0.96, 0.1], [0.1, -1.12, 0.1], [-0.86, -0.96, 0.25], [-1.22, -0.2, 0.5], [-1.26, 0.95, 0.9]],
    bend: 0.5, gain: 2.0, blur: 0.18, i: 1.05,
  },
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(sh)); gl.deleteShader(sh); return null; }
  return sh;
}
function program(gl, vsSrc, fsSrc, names) {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.bindAttribLocation(p, 0, "aA");
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(p)); return null; }
  const u = {};
  names.forEach((n) => { u[n] = gl.getUniformLocation(p, n); });
  return { p, u };
}

// how far along the page list we are, as a number (0 = top of Home, 1 = top of Customers …)
function pagePosition() {
  const pages = document.querySelectorAll(".page");
  if (!pages.length) return 0;
  const y = window.scrollY;
  let i = 0;
  for (let k = 0; k < pages.length; k++) if (pages[k].offsetTop <= y + 2) i = k;
  if (i >= pages.length - 1) return i;
  const a = pages[i].offsetTop;
  const b = pages[i + 1].offsetTop;
  return i + clamp01((y - a) / Math.max(1, b - a));
}

export default function Background({ page = 0 }) {
  const sceneRef = useRef(null);
  const canvasRef = useRef(null);
  const pageRef = useRef(page);
  pageRef.current = page;

  useEffect(() => {
    const canvas = canvasRef.current;
    const scene = sceneRef.current;
    if (!canvas || !scene) return undefined;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: "high-performance", preserveDrawingBuffer: false });
    if (!gl) return undefined;

    const common = ["uRes", "uPx", "uI", "uBendGain", "uCP", "uT", "uAsp", "uBend", "uTwist", "uPar", "uWide"];
    const strandProg = program(gl, STRAND_VS, STRAND_FS, common);
    const sparkProg = program(gl, SPARK_VS, SPARK_FS, [...common, "uPt"]);
    const compProg = program(gl, COMP_VS, COMP_FS, ["uTex", "uTexel", "uK", "uR"]);
    if (!strandProg || !sparkProg || !compProg) return undefined;

    // geometry: every filament is a ribbon of triangles; only (s, strand, side, random) is stored, the shader does the rest
    const verts = new Float32Array(STRANDS * (SEGMENTS + 1) * 2 * 4);
    const idx = new Uint16Array(STRANDS * SEGMENTS * 6);
    let vi = 0;
    let ii = 0;
    for (let k = 0; k < STRANDS; k++) {
      const strand = (k + 0.5) / STRANDS;
      const seed = (Math.sin(k * 12.9898) * 43758.5453) % 1;
      const rnd = Math.abs(seed);
      const base = vi / 4;
      for (let m = 0; m <= SEGMENTS; m++) {
        const s = m / SEGMENTS;
        for (const side of [-1, 1]) { verts[vi++] = s; verts[vi++] = strand; verts[vi++] = side; verts[vi++] = rnd; }
      }
      for (let m = 0; m < SEGMENTS; m++) {
        const a = base + m * 2;
        idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], ii);
        ii += 6;
      }
    }
    const strandBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, strandBuf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    const idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);

    const sparks = new Float32Array(SPARKS * 4);
    for (let i = 0; i < SPARKS; i++) {
      sparks[i * 4] = Math.random();
      sparks[i * 4 + 1] = Math.random() * 2 - 1;
      sparks[i * 4 + 2] = Math.random();
      sparks[i * 4 + 3] = Math.random();
    }
    const sparkBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sparkBuf);
    gl.bufferData(gl.ARRAY_BUFFER, sparks, gl.STATIC_DRAW);

    const quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 0, 0, 3, -1, 0, 0, -1, 3, 0, 0]), gl.STATIC_DRAW);

    // the small off-screen target the bloom is drawn into
    const tex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    const glow = { w: 2, h: 2 };
    const sizeGlow = (w, h) => {
      glow.w = Math.max(8, Math.round(w / 4));
      glow.h = Math.max(8, Math.round(h / 4));
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, glow.w, glow.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.disable(gl.DEPTH_TEST);
    gl.enableVertexAttribArray(0);
    scene.classList.add("has-gl");

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    const scale = Math.min(1, dpr * 0.78);
    const cur = { cp: new Float32Array(24), bend: 0.5, gain: 3, blur: 0, i: 1 };
    let size = { w: 2, h: 2, asp: 1.6 };
    let t = 14;
    let raf = 0;
    let last = 0;
    let running = true;
    const par = { x: 0, y: 0, tx: 0, ty: 0 };

    const resize = () => {
      const w = Math.max(2, Math.round(window.innerWidth * scale));
      const h = Math.max(2, Math.round(window.innerHeight * scale));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      size = { w, h, asp: w / h };
      sizeGlow(w, h);
    };

    // blend the scene for the current scroll position (or the open window's route) into `cur`
    const tgt = { cp: SCENES[0].cp, bend: 0.5, gain: 1, blur: 0, i: 1 };
    const fxs = { shift: 0, speed: 0, level: 0 };
    const settle = (dt, snap) => {
      const k = snap ? 1 : 1 - Math.exp(-dt * 5.5);
      const kf = snap ? 1 : 1 - Math.exp(-dt * 3.2);
      fxs.shift += (fx.shift - fxs.shift) * kf;
      fxs.speed += (fx.speed - fxs.speed) * (snap ? 1 : 1 - Math.exp(-dt * 4));
      fxs.level += (fx.level - fxs.level) * (snap ? 1 : 1 - Math.exp(-dt * 8));
      const over = OVERRIDES[topScene(getUI())];
      let from, to, e;
      if (over) { from = over; to = over; e = 0; }
      else {
        const pos = Math.min(SCENES.length - 1, Math.max(0, document.querySelector(".page") ? pagePosition() : pageRef.current));
        const i = Math.min(SCENES.length - 2, Math.floor(pos));
        const f = pos - i;
        e = f * f * (3 - 2 * f);
        from = SCENES[i];
        to = SCENES[Math.min(SCENES.length - 1, i + 1)];
      }
      const kk = over && !snap ? 1 - Math.exp(-dt * 3.4) : k;     // windows glide into their route a little more slowly
      const portrait = Math.max(0, 1 - size.asp);   // 0 on a landscape screen, about 0.55 on a phone
      for (let n = 0; n < 8; n++) {
        for (let c = 0; c < 3; c++) {
          let v = from.cp[n][c] + (to.cp[n][c] - from.cp[n][c]) * e;
          if (c === 0) v = (v + fxs.shift * 0.32) * size.asp + portrait * 0.6;   // on a phone the ribbon hugs the right edge, away from the text
          const j = n * 3 + c;
          cur.cp[j] += (v - cur.cp[j]) * kk;
        }
      }
      const mix = (p) => from[p] + (to[p] - from[p]) * e;
      cur.bend += (mix("bend") - cur.bend) * kk;
      cur.gain += (mix("gain") * (1 + fxs.level * 0.7) - cur.gain) * kk;
      cur.blur += (Math.min(1, mix("blur") + portrait * 0.3) - cur.blur) * kk;
      cur.i += (mix("i") * (1 - portrait * 0.45) * (1 + fxs.level * 0.35) - cur.i) * kk;
    };

    const setCommon = (pr, w, h) => {
      gl.uniform2f(pr.u.uRes, w, h);
      gl.uniform1f(pr.u.uT, t);
      gl.uniform1f(pr.u.uAsp, size.asp);
      gl.uniform3fv(pr.u.uCP, cur.cp);
      gl.uniform1f(pr.u.uBend, cur.bend);
      gl.uniform1f(pr.u.uTwist, 2.7);
      gl.uniform1f(pr.u.uBendGain, cur.gain);
      gl.uniform2f(pr.u.uPar, par.x, par.y);
      gl.uniform1f(pr.u.uWide, WIDE);
    };
    const drawStrands = (w, h, px, intensity) => {
      gl.useProgram(strandProg.p);
      setCommon(strandProg, w, h);
      gl.uniform1f(strandProg.u.uPx, px);
      gl.uniform1f(strandProg.u.uI, intensity);
      gl.bindBuffer(gl.ARRAY_BUFFER, strandBuf);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
      gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
    };

    const draw = () => {
      const blur = cur.blur;
      // 1 · bloom: the same ribbon, fatter, into the small target
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, glow.w, glow.h);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const gw = 1.8 + blur * 7.4;
      drawStrands(glow.w, glow.h, gw, (0.7 * (1.5 / gw) + 0.11 * blur) * cur.i);
      // 2 · the sharp filaments and sparks on the screen
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, size.w, size.h);
      gl.clearColor(0.012, 0.004, 0.013, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      drawStrands(size.w, size.h, (0.62 + blur * 1.5) * scale * 1.5, cur.i * (0.52 - 0.4 * blur));
      gl.useProgram(sparkProg.p);
      setCommon(sparkProg, size.w, size.h);
      gl.uniform1f(sparkProg.u.uPx, 0);
      gl.uniform1f(sparkProg.u.uI, cur.i * (0.95 - 0.7 * blur));
      gl.uniform1f(sparkProg.u.uPt, scale * 1.3);
      gl.bindBuffer(gl.ARRAY_BUFFER, sparkBuf);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.POINTS, 0, SPARKS);
      // 3 · lay the bloom over it
      gl.useProgram(compProg.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(compProg.u.uTex, 0);
      gl.uniform2f(compProg.u.uTexel, 1 / glow.w, 1 / glow.h);
      gl.uniform1f(compProg.u.uK, 1.0);
      gl.uniform1f(compProg.u.uR, 1.35 + blur * 2.6);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const frame = (now) => {
      raf = 0;
      if (!running) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - (last || now)) / 1000);
      last = now;
      t += dt * (SPEED + fxs.speed);
      const kp = 1 - Math.exp(-dt * 3);
      par.x += (par.tx - par.x) * kp;
      par.y += (par.ty - par.y) * kp;
      settle(dt, false);
      draw();
    };
    const still = () => { if (reduced && !raf) raf = requestAnimationFrame(() => { raf = 0; settle(1, true); draw(); }); };
    const onMove = (e) => {
      par.tx = (e.clientX / window.innerWidth - 0.5) * 0.07;
      par.ty = -(e.clientY / window.innerHeight - 0.5) * 0.05;
    };
    const onVis = () => {
      running = !document.hidden;
      if (running && !raf && !reduced) { last = 0; raf = requestAnimationFrame(frame); }
    };
    // if the browser ever drops the GL context, fall back to the CSS glow instead of a blank canvas
    const onLost = (e) => { e.preventDefault(); running = false; scene.classList.remove("has-gl"); };
    const onResize = () => { resize(); settle(1, true); draw(); };

    canvas.addEventListener("webglcontextlost", onLost);
    resize();
    settle(1, true);
    draw();
    if (!reduced) {
      raf = requestAnimationFrame(frame);
      window.addEventListener("pointermove", onMove, { passive: true });
    } else {
      window.addEventListener("scroll", still, { passive: true });
    }
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", still);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("webglcontextlost", onLost);
      scene.classList.remove("has-gl");
    };
  }, []);

  return (
    <div className="scene" ref={sceneRef} data-page={page} aria-hidden="true">
      <div className="pool pool-a"><i /></div>
      <div className="pool pool-b"><i /></div>
      <div className="pool pool-c"><i /></div>
      <canvas className="scene-gl" ref={canvasRef} />
      <div className="scene-vignette" />
    </div>
  );
}
