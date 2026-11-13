// Voice for Pandu AI's call mode. Uses the browser's own Web Speech API, so there is nothing to install and no key:
//   hearing  → SpeechRecognition   (Chrome, Edge, Safari)
//   speaking → speechSynthesis     (every modern browser)
// Where a browser lacks one half, the call still works with the other (type and hear, or speak and read).

const SR = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const synth = typeof window !== "undefined" ? window.speechSynthesis : null;

export const canHear = !!SR;
export const canSpeak = !!synth && typeof window.SpeechSynthesisUtterance !== "undefined";

// A phone only allows the microphone on a secure page (https://… or localhost). On plain http://192.168.x.x it blocks it
// silently and shows no question at all. askMic() is called straight from the tap on the call button so the browser can
// show its "Allow microphone?" question, and it tells us clearly what went wrong when it cannot.
//   → "ok" | "insecure" (page is not https) | "blocked" (person said no) | "nomic" (no microphone found)
export async function askMic() {
  if (typeof window === "undefined") return "ok";
  if (window.isSecureContext === false) return "insecure";
  if (!navigator.mediaDevices?.getUserMedia) return "ok";          // let SpeechRecognition ask by itself
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());                    // we only wanted the permission, not the sound
    return "ok";
  } catch (e) {
    if (e && (e.name === "NotAllowedError" || e.name === "SecurityError" || e.name === "PermissionDeniedError")) return "blocked";
    if (e && (e.name === "NotFoundError" || e.name === "DevicesNotFoundError")) return "nomic";
    return "ok";
  }
}

// ── hearing ───────────────────────────────────────────────────────────────
// Returns { start, stop }. onInterim(text) while the person talks, onFinal(text) once they have really finished,
// onEnd(reason) when listening stopped ("heard" | "silence" | "stopped" | "blocked" | "error").
//
// The browser alone decides you are "done" after a very short breath, which cut sentences in half. So we keep
// listening (continuous mode), collect everything said, and only send it once there has been `pauseMs` of quiet.
export function listen({ lang = "en-IN", onInterim, onFinal, onEnd, pauseMs = 1800 }) {
  if (!SR) { onEnd?.("error"); return { stop() {} }; }
  const rec = new SR();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = true;
  rec.maxAlternatives = 1;
  let committed = "";      // sentences the browser has finished
  let live = "";           // the sentence being spoken right now
  let timer = 0;
  let done = false;        // we already handed the text over (or were told to stop)
  let delivered = false;
  let reason = "silence";
  const full = () => `${committed} ${live}`.replace(/\s+/g, " ").trim();
  const deliver = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    const text = full();
    if (text) { delivered = true; onFinal?.(text); }
    try { rec.stop(); } catch { /* already stopped */ }
  };
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i += 1) {
      const r = e.results[i];
      if (r.isFinal) committed = `${committed} ${r[0].transcript}`.trim();
      else interim += r[0].transcript;
    }
    live = interim.trim();
    const text = full();
    if (!text || done) return;
    onInterim?.(text);
    clearTimeout(timer);
    timer = setTimeout(deliver, pauseMs);        // every new word restarts the countdown
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") reason = "blocked";
    else if (e.error === "aborted") reason = "stopped";
    else if (e.error === "no-speech") reason = "silence";
    else reason = "error";
  };
  rec.onend = () => {
    clearTimeout(timer);
    if (!done) {                                  // the browser ended it early: keep what we have
      done = true;
      const text = full();
      if (text && reason !== "blocked" && reason !== "stopped") { delivered = true; onFinal?.(text); }
    }
    onEnd?.(delivered ? "heard" : reason);
  };
  try { rec.start(); } catch { onEnd?.("error"); }
  return { stop() { done = true; reason = "stopped"; clearTimeout(timer); try { rec.abort(); } catch { /* already stopped */ } } };
}

// Is this just Pandu hearing its own voice (or a cough)? Used right after Pandu stops talking.
const norm = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
export function looksLikeEcho(heard, said) {
  const h = norm(heard);
  const sd = norm(said);
  if (h.replace(/\s/g, "").length < 2 || /^(uh+|um+|hm+|mm+|ah+|oh+|eh+|er+|huh)$/.test(h)) return true;   // a click, a breath, "hmm"
  if (!sd) return false;
  const words = h.split(" ");
  if (sd.includes(h)) return words.length >= 3;                         // Pandu's own sentence coming back through the speakers
  if (words.length < 3) return false;
  const pool = new Set(sd.split(" "));
  return words.filter((w) => pool.has(w)).length / words.length >= 0.75;
}

// ── speaking ──────────────────────────────────────────────────────────────
let voices = [];
const loadVoices = () => { voices = synth ? synth.getVoices() : []; };
if (synth) { loadVoices(); synth.addEventListener?.("voiceschanged", loadVoices); }

// Pandu is a boy panda: a warm, friendly MALE voice. Indian English first, then British, then any English one.
// If you want one particular voice, type part of its name here (for example "Ravi", "Prabhat", "David", "Guy"):
const PREFERRED_VOICE = "";

const FEMALE = /female|zira|hazel|susan|heera|neerja|aria|jenny|sonia|libby|samantha|karen|moira|tessa|veena|emma|michelle|natasha|clara|catherine|linda|kalpana|swara|ava|allison|victoria|serena|fiona|kate|nicky/i;
const MALE = /\bmale\b|david|mark|james|george|ravi|prabhat|guy|ryan|christopher|eric|brian|roger|steffan|davis|tony|andrew|thomas|alex|daniel|fred|liam|rishi|aaron|arthur|oliver|rocko|guy/i;

function voiceScore(v, lang) {
  let s = 0;
  if (FEMALE.test(v.name)) s -= 10;
  else if (MALE.test(v.name)) s += 10;
  if (v.lang.replace("_", "-").toLowerCase() === lang.toLowerCase()) s += 6;
  else if (/en[-_]in/i.test(v.lang)) s += 5;
  else if (/en[-_]gb/i.test(v.lang)) s += 3;
  else if (/en[-_]us/i.test(v.lang)) s += 2;
  if (/natural|neural|online/i.test(v.name)) s += 2;
  if (/google/i.test(v.name)) s -= 1;          // Chrome's network "Google" voices are the ones that stall mid-answer
  if (v.localService) s += 1.5;                 // voices stored on the computer do not hang when the internet is slow
  return s;
}

function pickVoice(lang) {
  if (!voices.length) loadVoices();
  const want = PREFERRED_VOICE.trim().toLowerCase();
  if (want) {
    const named = voices.find((v) => v.name.toLowerCase().includes(want));
    if (named) return named;
  }
  const en = voices.filter((v) => /^en[-_]/i.test(v.lang));
  return [...en].sort((a, b) => voiceScore(b, lang) - voiceScore(a, lang))[0] || null;
}

const isMaleVoice = (v) => !!v && !FEMALE.test(v.name) && MALE.test(v.name);

// What is read aloud: no markdown marks, no web addresses, no emoji, and not more than a few sentences.
export function speakable(text, max = 400) {
  let t = String(text || "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "a link")
    .replace(/[*_`#>]+/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s*\n+\s*/g, ". ")
    .replace(/\.\s*\./g, ".")
    .replace(/\s+/g, " ")
    .trim();
  let cut = false;
  if (t.length > max) {
    const slice = t.slice(0, max);
    const end = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("? "), slice.lastIndexOf("! "));
    t = (end > 160 ? slice.slice(0, end + 1) : slice).trim();
    cut = true;
  }
  return { text: t, cut };
}

// Chrome stops long utterances after ~15 s, so speak sentence by sentence.
const sentences = (t) => t.match(/[^.!?]+[.!?]*\s*/g)?.map((s) => s.trim()).filter(Boolean) || [t];

let token = 0;
export function stopSpeaking() {
  token += 1;
  if (synth) synth.cancel();
}

// speak(text, { lang, onStart, onEnd, onSentence }) → resolves when finished or cancelled
export function speak(text, { lang = "en-IN", onStart, onSentence, rate = 0.95, pitch } = {}) {
  if (!canSpeak || !text) return Promise.resolve();
  stopSpeaking();
  try { synth.resume(); } catch { /* ignore */ }      // Chrome sometimes stays 'paused' after a cancel
  const mine = token;
  const parts = sentences(text);
  return new Promise((resolve) => {
    let i = 0;
    let started = false;
    const next = () => {
      if (mine !== token || i >= parts.length) { resolve(); return; }
      const u = new window.SpeechSynthesisUtterance(parts[i]);
      const v = pickVoice(lang);
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = lang;
      u.rate = rate;
      // a real male voice only needs a touch deeper; if only girls' voices are installed, go lower so Pandu sounds like a boy
      u.pitch = pitch ?? (isMaleVoice(v) ? 0.9 : 0.7);
      // Some browsers have no voices installed and never fire any event: give up quietly instead of hanging the call.
      let settled = false;
      const advance = () => { if (settled) return; settled = true; clearTimeout(dog); i += 1; next(); };
      const dog = setTimeout(() => { if (mine === token) { try { synth.cancel(); } catch { /* ignore */ } } settled = true; if (!started) resolve(); else { i += 1; next(); } }, started ? 2500 + parts[i].length * 120 : 3500);
      u.onstart = () => { started = true; onStart?.(); onSentence?.(parts[i], i); };
      u.onend = advance;
      u.onerror = () => { settled = true; clearTimeout(dog); resolve(); };
      synth.speak(u);
    };
    // a short breath so the browser has finished cancelling anything that was playing
    setTimeout(next, 60);
  });
}
