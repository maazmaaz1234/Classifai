// Splits a headline into words that blur into focus one after another when their page arrives.
// Pass plain for sentences: they fade and rise without the blur, which is cheaper to draw.
//   <Words text="Predict who" />
//   <Words text="gets churn." className="ital" start={2} />
//   <Words text="Meet *Pandu,* your guide" step={30} />     (*word* renders bold)
//   <Words text="~Introducing~ ~Pandu,~ your guide" />      (~word~ is highlighted: serif italic in the red-to-amber gradient)
export function Words({ text, start = 0, step = 85, className = "", plain = false }) {
  const words = text.split(" ");
  return words.map((raw, i) => {
    const bold = raw.length > 2 && raw.startsWith("*") && raw.endsWith("*");
    const mark = raw.length > 2 && raw.startsWith("~") && raw.endsWith("~");
    const w = bold || mark ? raw.slice(1, -1) : raw;
    const el = (
      <span className={`rw${plain ? " plain" : ""}${mark ? " hl" : ""} ${className}`} style={{ "--w": start + i, "--st": `${step}ms` }}>{w}</span>
    );
    return (
      <span key={`${w}-${i}`}>
        {bold ? <strong>{el}</strong> : el}
        {i < words.length - 1 ? " " : ""}
      </span>
    );
  });
}

export const wordCount = (text) => text.split(" ").length;
