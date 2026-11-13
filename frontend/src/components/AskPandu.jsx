// The "Ask Pandu" pill on the dashboard. Its line rotates through useful questions;
// pressing it opens the chat with the visible question already asked.
import { useEffect, useState } from "react";
import { PanduFace } from "./Pandu";
import { IconArrowUpRight } from "./icons";

const PROMPTS = [
  "Analyse the churn prediction",
  "Who is most likely to leave?",
  "What drives churn in my customers?",
  "How does the SVM decide?",
];

export default function AskPandu({ onAsk }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % PROMPTS.length), 3400);
    return () => clearInterval(id);
  }, []);
  return (
    <button type="button" className="ask-wide" onClick={() => onAsk(PROMPTS[i])} aria-label={`Ask Pandu: ${PROMPTS[i]}`}>
      <span className="ask-wide-face"><PanduFace size={40} /></span>
      <span className="ask-wide-text">
        <small>Ask Pandu</small>
        <span className="ask-wide-line" key={i}>{PROMPTS[i].split(" ").map((w, k) => <span key={k} style={{ "--k": k }}>{w}</span>)}</span>
      </span>
      <span className="ask-wide-go"><IconArrowUpRight width="20" height="20" /></span>
    </button>
  );
}
