// The Classifai logo is just the name: "classif" in the display font with an italic serif "ai" lit in the
// ribbon's colours. No icon, no badge.
export function Logo({ className = "", size = 34 }) {
  return (
    <span className={`logo ${className}`} role="img" aria-label="Classifai" style={{ "--ls": `${size}px` }}>
      <span className="logo-word" aria-hidden="true">
        classif<span className="logo-ai">ai</span>
      </span>
    </span>
  );
}

export default Logo;
