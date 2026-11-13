import { useEffect, useRef } from "react";
import { Words } from "../components/Words";

export default function Home() {
  const titleRef = useRef(null);

  // The headline leans a few degrees toward the cursor, like Pandu's head does.
  useEffect(() => {
    const el = titleRef.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
    const onMove = (e) => {
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
    };
    const frame = () => {
      x += (tx - x) * 0.07;
      y += (ty - y) * 0.07;
      el.style.transform = `perspective(1100px) rotateY(${(x * 4).toFixed(2)}deg) rotateX(${(-y * 3).toFixed(2)}deg)`;
      raf = requestAnimationFrame(frame);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("pointermove", onMove); };
  }, []);

  return (
    <section id="home" className="page page-home" aria-label="Home" data-active="true">
      <div className="page-inner hero">
        <div className="hero-copy">
          <h1 className="hero-title depth" style={{ "--i": 0 }}>
            <span ref={titleRef} className="hero-title-in">
              <span className="hero-line"><Words text="Predict which" /></span>
              <span className="hero-line"><Words text="customers leave." start={2} className="ital" /></span>
            </span>
          </h1>
          <p className="hero-lede depth" style={{ "--i": 1 }} aria-label="Introducing Pandu, your friendly AI assistant for smarter customer insights and churn prediction.">
            <Words
              text="~Introducing~ ~Pandu,~ your friendly AI assistant for smarter customer insights and churn prediction."
              start={4}
              step={38}
              plain
            />
          </p>
        </div>
        <div className="hero-stage">
          <div id="pandu-slot" className="pandu-slot" />
        </div>
      </div>
    </section>
  );
}
