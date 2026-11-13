// The opening moment, like the reference site: a flat red screen with the name in the middle, then an iris
// opens from the centre and the page appears behind it.
import { useEffect, useState } from "react";

export default function Splash({ onReveal, onDone }) {
  const [phase, setPhase] = useState("in"); // in → open → gone

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t1 = setTimeout(() => { setPhase("open"); onReveal?.(); }, reduced ? 50 : 1050);
    const t2 = setTimeout(() => { setPhase("gone"); onDone?.(); }, reduced ? 120 : 2250);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onReveal, onDone]);

  if (phase === "gone") return null;
  return (
    <div className={`splash is-${phase}`} aria-hidden="true">
      <div className="splash-iris" />
      <div className="splash-word">classif<i>ai</i></div>
    </div>
  );
}
