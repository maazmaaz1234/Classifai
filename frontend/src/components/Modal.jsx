// Shared window: scrim + glass sheet that swings in from depth and swings back out on close.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ui } from "../lib/ui";

export const CloseIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
);

// scene = which ribbon route to show behind the window (see OVERRIDES in Background.jsx).
// While any window is open the page behind it is hidden (html[data-modal]) so the moving ribbon is what you see.
export default function Modal({ title, subtitle, onClose, children, size = 640, tint, bare = false, label, scene = "window" }) {
  const [closing, setClosing] = useState(false);
  const rootRef = useRef(null);
  const sheetRef = useRef(null);

  // `close` must keep the same identity for the whole life of the window: the effect below moves focus into the window,
  // and if it re-ran every time the parent re-rendered (each keystroke in a form) it would pull focus out of the field.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closingRef = useRef(false);
  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setTimeout(() => onCloseRef.current(), 320);
  }, []);

  useEffect(() => {
    const release = ui.pushScene(scene);
    const unhold = ui.holdPage();
    return () => { release(); unhold(); };
  }, [scene]);

  useEffect(() => {
    const prev = document.activeElement;
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    // keep the page behind from scrolling while a window is open (wheel inside scrollable sheets still works)
    const root = rootRef.current;
    const onWheel = (e) => { if (!e.target.closest("[data-scroll]")) e.preventDefault(); };
    root.addEventListener("wheel", onWheel, { passive: false });
    (sheetRef.current || root).focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      root.removeEventListener("wheel", onWheel);
      if (prev && prev.focus) prev.focus({ preventScroll: true });
    };
  }, [close]);

  return createPortal(
    <div ref={rootRef} className={`modal-root${closing ? " is-closing" : ""}`} style={tint ? { "--tint": tint } : undefined}>
      <div className="modal-scrim" onClick={close} />
      {bare ? (
        <div ref={sheetRef} tabIndex={-1} className="modal-bare" role="dialog" aria-modal="true" aria-label={label || title}>
          {typeof children === "function" ? children({ close }) : children}
        </div>
      ) : (
        <div
          ref={sheetRef}
          tabIndex={-1}
          data-scroll
          className="modal glass"
          style={{ width: `min(${size}px, 100%)` }}
          role="dialog"
          aria-modal="true"
          aria-label={label || title}
        >
          <div className="modal-head">
            <div>
              <h2 className="modal-title">{title}</h2>
              {subtitle && <p className="modal-sub">{subtitle}</p>}
            </div>
            <button type="button" className="icon-btn" aria-label="Close" onClick={close}><CloseIcon /></button>
          </div>
          {typeof children === "function" ? children({ close }) : children}
        </div>
      )}
    </div>,
    document.body,
  );
}
