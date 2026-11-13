import { useEffect, useRef } from "react";

// A small dropdown panel that closes on outside click or Escape.
export default function Popover({ open, onClose, trigger, children, className = "", align = "left" }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, onClose]);
  return (
    <div ref={ref} className={`pop-wrap ${className}${open ? " is-open" : ""}`}>
      {trigger}
      {open && <div className={`pop pop-${align}`} role="dialog">{children}</div>}
    </div>
  );
}
