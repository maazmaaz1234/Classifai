// Pandu AI: the chat window.
//   · a floating popup you can drag by its grip (or by the header) and a full-screen mode (button, or double-click the header)
//   · answers from your live customer data first (lib/pandu-brain.js), Google Gemini for everything else
//   · attach pictures, PDFs and text / CSV files (button, drag-and-drop, or paste)
//   · voice call: speak, Pandu answers out loud (browser speech, no extra key)
//   · asks "who developed Classifai?" → a card with the team (components/DeveloperCard.jsx)
// It is a portal on <body> so it floats above every window and the customer page.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PanduFace } from "./Pandu";
import { CloseIcon } from "./Modal";
import DeveloperCard from "./DeveloperCard";
import Logo from "./Logo";
import { askPandu, getPanduStatus, SUGGESTIONS } from "../lib/pandu-brain";
import { DEVELOPER_SUMMARY } from "../lib/developers";
import { fx, ui } from "../lib/ui";
import { readImage } from "../lib/store";
import { clamp } from "../lib/format";
import * as voice from "../lib/voice";

export { SUGGESTIONS };

const GREETING = "Hii, I'm Pandu AI. Ask me about your customer churn, who might leave and why, or how the SVM works. I can also answer general questions, read pictures and files you attach, and talk with you on a voice call.";
const SETUP_HELP = "To connect me to Google Gemini:\n1. Create a free key at https://aistudio.google.com/apikey\n2. In the backend folder, copy .env.example to .env and set GEMINI_API_KEY=your key\n3. Restart the back end (python app.py)\nThe key stays on your own server and never reaches the website, so please don't paste it in this chat.";
const KEY_WARNING = "That looks like an API key, so I did not send it anywhere. Please keep keys out of the chat: put it in backend/.env as GEMINI_API_KEY and restart the back end. If you pasted it anywhere public, create a new one.";
const KEY_RE = /AIza[0-9A-Za-z_-]{20,}|\bsk-[A-Za-z0-9_-]{20,}/;
const LANG = "en-IN";
// true  = you can talk over Pandu during a voice call and he stops to listen (best with headphones).
// false = he always finishes his sentence first (set this if your speakers make him hear himself and stop on his own).
const INTERRUPTION = true;
const STOP_ONLY = /^\W*(stop|wait|hold on|hang on|pause|enough|quiet|be quiet|shut up|okay stop|ok stop|cancel|one second|just a second)\W*$/i;
const MAX_FILES = 4;
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

let counter = 0;
const mid = () => `m${(counter += 1)}`;

// ── a small, safe Markdown renderer for Pandu's answers (bold, code, links, lists, line breaks) ─────────
const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s)]+)/g;
function Inline({ text }) {
  const out = [];
  let last = 0;
  let key = 0;
  let m;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(text))) {
    const t = m[0];
    if (m.index > last) out.push(text.slice(last, m.index));
    if (t.startsWith("**")) out.push(<strong key={key++}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={key++}>{t.slice(1, -1)}</code>);
    else if (t.startsWith("[")) {
      const p = /\[([^\]]+)\]\((.+)\)/.exec(t);
      out.push(<a key={key++} href={p[2]} target="_blank" rel="noopener noreferrer">{p[1]}</a>);
    } else out.push(<a key={key++} href={t} target="_blank" rel="noopener noreferrer">{t}</a>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const LIST = /^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/;
function Rich({ text }) {
  const blocks = [];
  String(text).split(/\n{2,}/).forEach((chunk) => {
    let para = [];
    let list = null;
    const flushPara = () => { if (para.length) { blocks.push({ type: "p", lines: para }); para = []; } };
    const flushList = () => { if (list) { blocks.push(list); list = null; } };
    chunk.split("\n").forEach((line) => {
      const li = LIST.exec(line);
      if (li) {
        flushPara();
        const ordered = !!li[1];
        if (!list || list.ordered !== ordered) { flushList(); list = { type: "list", ordered, start: ordered ? Number(li[1]) : 1, items: [] }; }
        list.items.push(li[2]);
      } else if (line.trim()) { flushList(); para.push(line); }
    });
    flushPara();
    flushList();
  });
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === "p") {
          return <p key={i}>{b.lines.map((l, j) => <span key={j}>{j > 0 && <br />}<Inline text={l} /></span>)}</p>;
        }
        const Tag = b.ordered ? "ol" : "ul";
        return <Tag key={i} start={b.ordered ? b.start : undefined}>{b.items.map((it, j) => <li key={j}><Inline text={it} /></li>)}</Tag>;
      })}
    </>
  );
}

// ── geometry ─────────────────────────────────────────────────────────────────────────────────────────
function useViewport() {
  const [v, setV] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const on = () => setV({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return v;
}

function popupRect(v, pos) {
  const width = Math.min(410, v.w - 24);
  const height = Math.min(Math.max(320, Math.min(580, v.h - 190)), v.h - 24);
  if (pos) return { left: clamp(pos.x, 0, Math.max(0, v.w - width)), top: clamp(pos.y, 0, Math.max(0, v.h - height)), width, height };
  const right = clamp(v.w * 0.03, 12, 36);
  return { left: v.w - width - right, top: Math.max(12, v.h - (v.w > 560 ? 116 : 98) - height), width, height };
}

const toBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(",")[1] || "");
  r.onerror = () => reject(new Error("read"));
  r.readAsDataURL(file);
});

const Icon = {
  grip: <svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor" stroke="none"><circle cx="9" cy="6" r="1.7" /><circle cx="15" cy="6" r="1.7" /><circle cx="9" cy="12" r="1.7" /><circle cx="15" cy="12" r="1.7" /><circle cx="9" cy="18" r="1.7" /><circle cx="15" cy="18" r="1.7" /></g></svg>,
  expand: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" /></svg>,
  shrink: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10h-6V4M4 14h6v6M14 10l7-7M10 14l-7 7" /></svg>,
  phone: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2Z" /></svg>,
  hangup: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 14c5-5 13-5 18 0l-2.4 2.6-3.2-1.4v-2.6a11 11 0 0 0-6.8 0v2.6l-3.2 1.4Z" /></svg>,
  mic: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>,
  micOff: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4l16 16M9 9v2a3 3 0 0 0 5 2.2M15 9.5V6a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 11.5 5.3M19 11a7 7 0 0 1-.6 2.8M12 18v3" /></svg>,
  clip: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5 12.2 19.3a5 5 0 0 1-7-7L13.6 4a3.4 3.4 0 0 1 4.8 4.8l-8.4 8.4a1.8 1.8 0 0 1-2.6-2.6l7.4-7.4" /></svg>,
  send: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" /></svg>,
  file: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7zM14 3v5h5" /></svg>,
};

const CALL_LABEL = {
  connecting: "Connecting…",
  listening: "Listening… speak now",
  thinking: "Thinking…",
  speaking: "Speaking… tap me to interrupt",
  paused: "Your microphone is muted",
  idle: "Tap me to talk",
  blocked: "The microphone is blocked. Allow it in the address bar (or the site settings), then tap me, or type below.",
  insecure: "This page is not https, so your phone blocks the microphone. Open the https link, or type below and I'll answer out loud.",
  nomic: "I can't find a microphone on this device. Type below and I'll answer out loud.",
  type: "Your browser can't hear me, but type below and I'll answer out loud.",
};

export default function ChatWindow({ open, seed, onClose }) {
  const [messages, setMessages] = useState(() => [{ id: "greet", from: "pandu", text: GREETING }]);
  const [chips, setChips] = useState(SUGGESTIONS);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState([]);
  const [thinking, setThinking] = useState(false);
  const [slow, setSlow] = useState(false);
  const [note, setNote] = useState("");
  const [visible, setVisible] = useState(open);
  const [closing, setClosing] = useState(false);
  const [full, setFull] = useState(false);
  const [pos, setPos] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [status, setStatus] = useState(null);
  const [call, setCall] = useState(null);
  const [, setTick] = useState(0);
  const vp = useViewport();

  const rootRef = useRef(null);
  const bodyRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const orbRef = useRef(null);
  const lastSeed = useRef(null);
  const history = useRef([{ from: "pandu", text: GREETING }]);
  const topic = useRef("");
  const busy = useRef(false);
  const alive = useRef(true);
  const noteTimer = useRef(0);
  const callRef = useRef({ on: false });
  const recRef = useRef(null);
  const pulse = useRef({ mode: "off", raf: 0 });
  const api = useRef({});

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const push = useCallback((m) => setMessages((list) => [...list, m]), []);
  const say = useCallback((text) => {
    setNote(text);
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(""), 5000);
  }, []);

  // ── open / close ──
  useEffect(() => {
    if (open) { setVisible(true); setClosing(false); return undefined; }
    if (visible) {
      setClosing(true);
      const id = setTimeout(() => { setVisible(false); setClosing(false); setFull(false); }, 300);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // opening the chat gives the ribbon a little push; the full-screen chat gets its own ribbon route and hides the page
  useEffect(() => {
    if (!visible) return undefined;
    fx.speed = 0.9;
    const id = setTimeout(() => { if (!callRef.current.on) fx.speed = 0; }, 600);
    return () => clearTimeout(id);
  }, [visible]);

  useEffect(() => {
    if (!visible || !full) return undefined;
    const release = ui.pushScene("chat");
    const unhold = ui.holdPage();
    fx.speed = 2;
    const id = setTimeout(() => { if (!callRef.current.on) fx.speed = 0; }, 900);
    return () => { release(); unhold(); clearTimeout(id); if (!callRef.current.on) fx.speed = 0; };
  }, [visible, full]);

  useEffect(() => {
    if (!visible) return undefined;
    let live = true;
    getPanduStatus(true).then((s) => { if (live) setStatus(s); });
    return () => { live = false; };
  }, [visible]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (full) setFull(false); else onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, full, onClose]);

  useEffect(() => {
    if (!visible || call) return undefined;
    const id = setTimeout(() => inputRef.current && inputRef.current.focus({ preventScroll: true }), 420);
    return () => clearTimeout(id);
  }, [visible, full, call]);

  // keep the newest message in view; a message taller than the window (the developers card) is shown from its top
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const last = el.lastElementChild;
    if (last && !thinking && last.offsetHeight > el.clientHeight - 24 && last.classList.contains("pc-msg")) {
      el.scrollTop = last.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - 10;
    } else el.scrollTop = el.scrollHeight;
  }, [messages, thinking, visible, call, full]);

  // ── asking ──
  const ask = useCallback(async (text, { spoken = false, files = [] } = {}) => {
    const q = text.trim();
    if ((!q && !files.length) || busy.current) return null;
    if (KEY_RE.test(q)) {
      push({ id: mid(), from: "me", text: "•••••••• (API key hidden)" });
      push({ id: mid(), from: "pandu", text: KEY_WARNING });
      return { text: KEY_WARNING, topic: "" };
    }
    busy.current = true;
    const shown = q || `Attached ${files.map((f) => f.name).join(", ")}`;
    const prior = history.current;
    history.current = [...prior, { from: "me", text: shown }];
    push({ id: mid(), from: "me", text: q, files: files.map(({ name, mime, thumb }) => ({ name, mime, thumb })) });
    setChips([]);
    setThinking(true);
    setSlow(false);
    const slowTimer = setTimeout(() => setSlow(true), 4500);
    const started = Date.now();
    let answer;
    try {
      answer = await askPandu(q || "Please look at what I attached and tell me what you see.", prior, topic.current, files, { voice: spoken });
    } catch {
      answer = { text: "Sorry, something went wrong on my side. Please try that again.", topic: "", follow: SUGGESTIONS, error: true };
    }
    clearTimeout(slowTimer);
    if (!spoken) {
      // a short, natural pause so the reply doesn't appear instantly
      const wait = Math.max(0, 450 + Math.min(450, answer.text.length * 1.1) - (Date.now() - started));
      if (wait) await new Promise((r) => setTimeout(r, wait));
    }
    if (!alive.current) { busy.current = false; return null; }
    topic.current = answer.topic || "";
    history.current = [...history.current, { from: "pandu", text: answer.text }];
    push({ id: mid(), from: "pandu", text: answer.text, card: answer.card, sources: answer.sources, error: answer.error });
    setChips(answer.follow || SUGGESTIONS);
    setThinking(false);
    setSlow(false);
    busy.current = false;
    return answer;
  }, [push]);

  // A question sent from elsewhere (the Dashboard prompt, the Model page, Support) is asked automatically.
  useEffect(() => {
    if (open && seed && seed.id !== lastSeed.current) { lastSeed.current = seed.id; ask(seed.text); }
  }, [open, seed]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (e) => {
    e.preventDefault();
    if ((!draft.trim() && !pending.length) || thinking) return;
    const t = draft;
    const f = pending;
    setDraft("");
    setPending([]);
    ask(t, { files: f });
  };

  // ── attachments ──
  const addFiles = useCallback(async (list) => {
    const files = Array.from(list || []);
    if (!files.length) return;
    const added = [];
    for (const file of files) {
      try {
        if (file.type.startsWith("image/")) {
          const url = await readImage(file, 1600);
          added.push({ id: mid(), name: file.name || "picture.jpg", mime: "image/jpeg", data: url.split(",")[1], thumb: url });
        } else if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
          if (file.size > 12 * 1024 * 1024) { say(`${file.name} is bigger than 12 MB. Try a smaller PDF.`); continue; }
          added.push({ id: mid(), name: file.name, mime: "application/pdf", data: await toBase64(file) });
        } else if (file.type.startsWith("text/") || /\.(txt|csv|tsv|md|json|log)$/i.test(file.name)) {
          if (file.size > 400 * 1024) { say(`${file.name} is too big to read here (400 KB limit). Use Import CSV on the Customers page for big customer files.`); continue; }
          const text = (await file.text()).slice(0, 60000);
          added.push({ id: mid(), name: file.name, mime: file.type || "text/plain", text });
        } else say(`I can read pictures, PDFs and text or CSV files, but not ${file.name || "that kind of file"}.`);
      } catch {
        say(`I couldn't read ${file.name || "that file"}.`);
      }
    }
    if (!added.length) return;
    setPending((p) => {
      if (p.length + added.length > MAX_FILES) say(`You can attach up to ${MAX_FILES} files at a time.`);
      return [...p, ...added].slice(0, MAX_FILES);
    });
  }, [say]);

  const onDrop = (e) => {
    e.preventDefault();
    setDropping(false);
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  };
  const onPaste = (e) => {
    const files = Array.from(e.clipboardData?.files || []);
    if (files.length) { e.preventDefault(); addFiles(files); }
  };

  // ── dragging and full screen ──
  const startDrag = (e) => {
    if (full || e.button > 0 || e.target.closest("button:not(.pc-grip), a, input")) return;
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const o = { px: e.clientX, py: e.clientY, x: r.left, y: r.top, moved: false, last: null };
    const move = (ev) => {
      const dx = ev.clientX - o.px;
      const dy = ev.clientY - o.py;
      if (!o.moved && Math.hypot(dx, dy) < 4) return;
      if (!o.moved) { o.moved = true; setDragging(true); }
      const x = clamp(o.x + dx, 0, Math.max(0, window.innerWidth - r.width));
      const y = clamp(o.y + dy, 0, Math.max(0, window.innerHeight - r.height));
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      o.last = { x, y };
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (o.moved) { setDragging(false); if (o.last) setPos(o.last); }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  const onHeadDouble = (e) => { if (!e.target.closest("button, a, input")) setFull((f) => !f); };

  // ── voice call ──
  const setPulse = useCallback((mode) => {
    const p = pulse.current;
    p.mode = mode;
    if (mode === "off" || p.raf) return;
    const loop = (t) => {
      const m = p.mode;
      if (m === "off") {
        p.raf = 0;
        fx.level = 0;
        fx.speed = 0;
        if (orbRef.current) orbRef.current.style.setProperty("--lvl", "0");
        return;
      }
      let level;
      let speed = 0;
      if (m === "speak") { level = 0.4 + 0.45 * Math.abs(Math.sin(t / 120) * Math.sin(t / 310 + 1)); speed = 0.6; }
      else if (m === "listen") level = 0.1 + 0.07 * Math.sin(t / 420);
      else { level = 0.18 + 0.1 * Math.sin(t / 260); speed = 0.25; }
      fx.level = level;
      fx.speed = speed;
      if (orbRef.current) orbRef.current.style.setProperty("--lvl", level.toFixed(3));
      p.raf = requestAnimationFrame(loop);
    };
    p.raf = requestAnimationFrame(loop);
  }, []);

  useEffect(() => () => { pulse.current.mode = "off"; cancelAnimationFrame(pulse.current.raf); fx.level = 0; }, []);

  const speakAnswer = async (ans) => {
    const c = callRef.current;
    let text;
    let cut = false;
    if (ans.card?.type === "developers") text = `${DEVELOPER_SUMMARY.replace(" Here they are.", "")} Their photos are in the chat.`;
    else ({ text, cut } = voice.speakable(ans.text));
    if (cut) text += " I've written the rest in the chat.";
    setCall((s) => s && { ...s, state: "speaking", said: ans.card ? text : ans.text });
    if (!voice.canSpeak) return undefined;
    c.said = text;
    c.barged = false;
    c.speaking = true;
    setPulse("speak");
    // While Pandu talks, a quiet listener waits for you to speak over him. It ignores everything until it is sure it is
    // a person (and not Pandu's own voice coming back); then Pandu stops and the same listener carries on as your turn.
    const canWatch = INTERRUPTION && voice.canHear && !(typeof window !== "undefined" && window.isSecureContext === false);
    let tries = 0;
    const arm = () => {
      if (!canWatch || !c.on || callRef.current !== c || c.muted || !c.speaking || c.barged || tries > 8) return;
      tries += 1;
      recRef.current = voice.listen({
        lang: LANG,
        gate: (t) => voice.isInterruption(t, text),
        onOpen: (t) => {
          if (!c.on || callRef.current !== c) return;
          c.barged = true;
          c.speaking = false;
          voice.stopSpeaking();
          setCall((s) => s && { ...s, state: "listening", heard: t });
          setPulse("listen");
        },
        onInterim: (t) => { if (c.barged) setCall((s) => s && { ...s, heard: t }); },
        onFinal: (t) => {
          if (!c.barged || !c.on || callRef.current !== c) return;
          if (STOP_ONLY.test(t)) { api.current.listenNext(); return; }   // just "stop": Pandu is quiet now, and waits
          c.silent = 0;
          api.current.handleHeard(t);
        },
        onEnd: (why) => {
          if (c.barged || !c.speaking || why === "blocked") return;
          setTimeout(arm, 150);    // the browser closes a listener after a while; keep one open until Pandu has finished
        },
      });
    };
    arm();
    await voice.speak(text, { lang: LANG });
    c.speaking = false;
    if (c.barged) return "barged";
    recRef.current?.stop();        // close the quiet listener
    c.spokeAt = Date.now();
    setPulse("listen");
    // a short pause so the room goes quiet before the microphone opens (the echo filter catches anything that slips through)
    await new Promise((r) => setTimeout(r, 450));
    return undefined;
  };

  api.current.listenNext = () => {
    const c = callRef.current;
    if (!c.on) return;
    if (c.muted) { setCall((s) => s && { ...s, state: "paused" }); setPulse("off"); return; }
    if (!voice.canHear) { setCall((s) => s && { ...s, state: "type" }); setPulse("off"); return; }
    if (typeof window !== "undefined" && window.isSecureContext === false) { setCall((s) => s && { ...s, state: "insecure" }); setPulse("off"); return; }   // plain http: the phone never allows the microphone
    setCall((s) => s && { ...s, state: "listening", heard: "" });
    setPulse("listen");
    recRef.current = voice.listen({
      lang: LANG,
      onInterim: (t) => setCall((s) => s && { ...s, heard: t }),
      onFinal: (t) => {
        // noise, a cough, or Pandu's own voice coming back through the speakers: ignore it and keep listening
        if (c.spokeAt && Date.now() - c.spokeAt < 8000 && voice.looksLikeEcho(t, c.said)) { setTimeout(() => api.current.listenNext(), 250); return; }
        if (voice.looksLikeEcho(t, "")) { setTimeout(() => api.current.listenNext(), 250); return; }
        c.silent = 0;
        api.current.handleHeard(t);
      },
      onEnd: (why) => {
        if (!c.on || callRef.current !== c) return;
        if (why === "heard" || why === "stopped") return;
        if (why === "blocked") { setCall((s) => s && { ...s, state: "blocked", said: "" }); setPulse("off"); return; }
        c.silent += 1;
        if (why === "silence" && c.silent < 3) { api.current.listenNext(); return; }
        setCall((s) => s && { ...s, state: "idle" });
        setPulse("off");
      },
    });
  };

  api.current.handleHeard = async (text) => {
    const c = callRef.current;
    if (!c.on || !text.trim()) return;
    recRef.current?.stop();
    setCall((s) => s && { ...s, state: "thinking", heard: text });
    setPulse("think");
    const ans = await ask(text, { spoken: true });
    if (!c.on || callRef.current !== c) return;
    if (!ans) { api.current.listenNext(); return; }
    const how = await speakAnswer(ans);
    if (how === "barged") return;      // you spoke over Pandu: that listener is already taking your turn
    if (c.on && callRef.current === c) api.current.listenNext();
  };

  const startCall = () => {
    if (callRef.current.on) return;
    const c = { on: true, silent: 0, muted: false, since: Date.now() };
    callRef.current = c;
    // Ask for the microphone right now, inside the tap, so the phone shows its "Allow microphone?" question.
    const mic = voice.canHear ? voice.askMic() : Promise.resolve("ok");
    const insecure = voice.canHear && typeof window !== "undefined" && window.isSecureContext === false;
    const hello = insecure
      ? "Hi! This page is not secure, so your phone blocks the microphone. Type your question and I'll answer out loud."
      : voice.canHear ? "Hi! I'm listening. Ask me anything." : "Hi! Type your question and I'll answer out loud.";
    setCall({ state: "connecting", heard: "", said: hello, muted: false, since: c.since });
    setPulse("speak");
    c.said = hello;
    const talked = voice.canSpeak ? voice.speak(hello, { lang: LANG }) : Promise.resolve();
    Promise.all([talked, mic]).then(([, micState]) => {
      if (callRef.current !== c) return;
      c.spokeAt = Date.now();
      if (micState !== "ok") { setCall((s) => s && { ...s, state: micState, said: "" }); setPulse("off"); return; }
      setTimeout(() => { if (callRef.current === c) api.current.listenNext(); }, 450);
    });
  };

  const endCall = useCallback((quiet = false) => {
    const c = callRef.current;
    if (!c.on) return;
    c.on = false;
    recRef.current?.stop();
    voice.stopSpeaking();
    setPulse("off");
    setCall(null);
    if (!quiet) push({ id: mid(), from: "sys", text: `Voice call ended · ${fmtTime((Date.now() - c.since) / 1000)}` });
  }, [push, setPulse]);

  useEffect(() => { if (!open) endCall(true); }, [open, endCall]);
  useEffect(() => () => endCall(true), [endCall]);

  useEffect(() => {
    if (!call) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [!!call]); // eslint-disable-line react-hooks/exhaustive-deps

  const onOrb = () => {
    const c = callRef.current;
    if (!c.on || !call) return;
    if (call.state === "speaking") { voice.stopSpeaking(); return; }
    if (call.state === "blocked") { voice.askMic().then((m) => { if (callRef.current === c && m === "ok") { c.silent = 0; api.current.listenNext(); } }); return; }   // asks again, in case the person changed their mind
    if (call.state === "idle") { c.silent = 0; api.current.listenNext(); }
  };
  const toggleMute = () => {
    const c = callRef.current;
    if (!c.on) return;
    c.muted = !c.muted;
    setCall((s) => s && { ...s, muted: c.muted });
    if (c.muted) {
      recRef.current?.stop();
      if (call?.state === "listening") { setCall((s) => s && { ...s, state: "paused" }); setPulse("off"); }
    } else if (call?.state === "paused" || call?.state === "idle") api.current.listenNext();
  };
  const [callDraft, setCallDraft] = useState("");
  const submitCallText = (e) => {
    e.preventDefault();
    const t = callDraft;
    if (!t.trim()) return;
    setCallDraft("");
    api.current.handleHeard(t);
  };

  if (!visible) return null;

  const geo = full ? { left: 0, top: 0, width: vp.w, height: vp.h } : popupRect(vp, pos);
  const info = !status ? { tone: "off", text: "Connecting…" }
    : status.gemini ? { tone: "ok", text: status.label || `Gemini · ${status.model}`, brand: /^classifai\b/i.test(status.label || "") }
    : status.online ? { tone: "warn", text: "Local mode", more: " · connect Gemini" }
    : { tone: "off", text: "Offline · local mode" };
  const onStatus = () => {
    if (status && status.gemini) { getPanduStatus(true).then(setStatus); return; }
    push({ id: mid(), from: "pandu", text: SETUP_HELP });
    getPanduStatus(true).then(setStatus);
  };
  const callSecs = call ? (Date.now() - call.since) / 1000 : 0;
  // before the first question the chat shows a calm welcome (the mark, a headline and four ideas) instead of a chat bubble
  const empty = !call && !thinking && messages.length === 1 && messages[0].id === "greet";

  return createPortal(
    <section
      ref={rootRef}
      className={`pc glass${empty ? " is-empty" : ""}${full ? " is-full" : ""}${closing ? " is-closing" : ""}${dragging ? " is-dragging" : ""}${dropping ? " is-drop" : ""}${call ? " on-call" : ""}`}
      style={geo}
      role="dialog"
      aria-label="Chat with Pandu AI"
      onDragOver={(e) => { if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); setDropping(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropping(false); }}
      onDrop={onDrop}
    >
      <header className="pc-head" onPointerDown={startDrag} onDoubleClick={onHeadDouble}>
        <button type="button" className="pc-grip" aria-label="Drag to move the chat" title="Drag to move · double-click the header for full screen" tabIndex={full ? -1 : 0}>{Icon.grip}</button>
        <PanduFace size={42} />
        <div className="pc-title">
          <h3>Pandu AI</h3>
          {call
            ? <small className="pc-oncall"><i />On call · {fmtTime(callSecs)}</small>
            : <button type="button" className="pc-status" data-tone={info.tone} onClick={onStatus} title={status && status.gemini ? `${status.label || "Gemini"} is connected` : "How to connect Gemini"}><i />{info.brand ? <Logo size={17} /> : <>{info.text}{info.more && <span className="pc-st-x">{info.more}</span>}</>}</button>}
        </div>
        <div className="pc-tools">
          <button type="button" className={`pc-tool${call ? " is-end" : ""}`} aria-label={call ? "End the voice call" : "Start a voice call"} title={call ? "End the call" : "Voice call"} onClick={() => (call ? endCall() : startCall())}>{call ? Icon.hangup : Icon.phone}</button>
          <button type="button" className="pc-tool" aria-label={full ? "Exit full screen" : "Full screen"} title={full ? "Exit full screen" : "Full screen"} onClick={() => setFull((f) => !f)}>{full ? Icon.shrink : Icon.expand}</button>
          <button type="button" className="pc-tool pc-x" aria-label="Close chat" title="Close" onClick={onClose}><CloseIcon /></button>
        </div>
      </header>

      <div className="pc-main" hidden={!!call}>
        <div className="pc-body" ref={bodyRef} data-scroll aria-live="polite">
          {empty && (
            <div className="pc-hero">
              <span className="pc-mark"><PanduFace size={120} /></span>
              <h2 className="pc-h1">How can I help you today?</h2>
              <p className="pc-sub">Ask about your customers, who might leave and why, or how the model decides.</p>
            </div>
          )}
          {!empty && messages.map((m) => (m.from === "sys" ? (
            <div key={m.id} className="pc-sys">{m.text}</div>
          ) : (
            <div key={m.id} className={`pc-msg${m.from === "me" ? " me" : ""}`}>
              {m.from === "pandu" && <PanduFace size={30} />}
              <div className="pc-col">
                {(m.text || m.files?.length > 0) && (
                  <div className={`pc-bubble${m.error ? " is-error" : ""}`}>
                    {m.files?.length > 0 && (
                      <div className="pc-files">
                        {m.files.map((f, i) => (f.thumb
                          ? <img key={i} src={f.thumb} alt={f.name} />
                          : <span key={i} className="pc-file">{Icon.file}{f.name}</span>))}
                      </div>
                    )}
                    {m.text && (m.from === "me" ? <p>{m.text}</p> : <Rich text={m.text} />)}
                  </div>
                )}
                {m.card?.type === "developers" && <DeveloperCard focus={m.card.focus} />}
                {m.sources?.length > 0 && (
                  <div className="pc-sources">
                    <span>Sources</span>
                    {m.sources.map((s, i) => (s.uri ? <a key={i} href={s.uri} target="_blank" rel="noopener noreferrer">{s.title || s.uri}</a> : null))}
                  </div>
                )}
              </div>
            </div>
          )))}
          {thinking && (
            <div className="pc-msg">
              <PanduFace size={30} />
              <div className="pc-col"><div className="pc-bubble pc-typing"><i /><i /><i />{slow && <em>Looking that up…</em>}</div></div>
            </div>
          )}
        </div>

        <div className="pc-chips">
          {chips.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => ask(s)} disabled={thinking}>{s}</button>
          ))}
        </div>

        {note && <p className="pc-note" role="status">{note}</p>}
        {pending.length > 0 && (
          <div className="pc-pending">
            {pending.map((f) => (
              <span key={f.id} className="pc-pend">
                {f.thumb ? <img src={f.thumb} alt="" /> : Icon.file}
                <b>{f.name}</b>
                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setPending((p) => p.filter((x) => x.id !== f.id))}><CloseIcon /></button>
              </span>
            ))}
          </div>
        )}
        <form className="pc-form" onSubmit={submit}><span className="pc-ring-border" aria-hidden="true" />
          <input ref={fileRef} type="file" multiple hidden accept="image/*,application/pdf,.pdf,.txt,.csv,.tsv,.md,.json,.log" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          <button type="button" className="pc-clip" aria-label="Attach a picture or file" title="Attach a picture, PDF or CSV" onClick={() => fileRef.current && fileRef.current.click()}>{Icon.clip}</button>
          <input ref={inputRef} className="input" value={draft} maxLength={2000} onChange={(e) => setDraft(e.target.value)} onPaste={onPaste} placeholder="Ask Pandu anything" aria-label="Message Pandu AI" autoComplete="off" />
          <button type="submit" className="chat-send" aria-label="Send" disabled={thinking || (!draft.trim() && !pending.length)}>{Icon.send}</button>
        </form>
      </div>

      {call && (
        <div className="pc-call" data-state={call.state}>
          <button type="button" ref={orbRef} className="pc-orb" onClick={onOrb} aria-label={CALL_LABEL[call.state]}>
            <span className="pc-ring" />
            <span className="pc-ring r2" />
            <PanduFace size={120} />
          </button>
          <p className="pc-call-state" role="status">{CALL_LABEL[call.state]}</p>
          <p className="pc-heard">{call.heard ? `“${call.heard}”` : " "}</p>
          <div className="pc-said" data-scroll>{call.said}</div>
          {(call.state === "type" || call.state === "blocked" || call.state === "insecure" || call.state === "nomic" || call.state === "idle") && (
            <form className="pc-call-type" onSubmit={submitCallText}>
              <input className="input" value={callDraft} onChange={(e) => setCallDraft(e.target.value)} placeholder="Type your question" aria-label="Type your question" autoComplete="off" />
              <button type="submit" className="chat-send" aria-label="Send" disabled={!callDraft.trim()}>{Icon.send}</button>
            </form>
          )}
          <div className="pc-call-actions">
            <button type="button" className={`pc-circle${call.muted ? " is-on" : ""}`} onClick={toggleMute} aria-pressed={call.muted} aria-label={call.muted ? "Unmute microphone" : "Mute microphone"} disabled={!voice.canHear}>{call.muted ? Icon.micOff : Icon.mic}</button>
            <button type="button" className="pc-circle is-end" onClick={() => endCall()} aria-label="End the call">{Icon.hangup}</button>
          </div>
        </div>
      )}
      {dropping && <div className="pc-drop"><span>Drop pictures, PDFs or CSV files here</span></div>}
    </section>,
    document.body,
  );
}
