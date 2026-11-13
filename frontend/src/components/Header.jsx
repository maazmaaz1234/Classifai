import { useEffect, useRef, useState } from "react";
import { Logo } from "./Logo";
import Avatar from "./Avatar";

export { Logo };

export function ProfileMenu({ user, onSettings, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div className="profile" ref={ref}>
      <button
        type="button"
        className="round-btn round-pic"
        aria-label="Your profile"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar person={user} size="100%" />
      </button>
      {open && (
        <div className="profile-menu glass" role="menu">
          <div className="profile-who">
            <Avatar person={user} size={46} className="profile-avatar" />
            <div>
              <strong>{user?.name || "Classifai"}</strong>
              <small>{user?.email}</small>
            </div>
          </div>
          <button type="button" role="menuitem" className="menu-item" onClick={() => { setOpen(false); onSettings(); }}>
            Edit profile and settings
          </button>
          <div className="menu-sep" />
          <button type="button" role="menuitem" className="menu-item is-danger" onClick={() => { setOpen(false); onLogout(); }}>
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

export default function Header({ user, onAsk, onHome, onSettings, onLogout }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <ProfileMenu user={user} onSettings={onSettings} onLogout={onLogout} />
        <a className="logo-link" href="#home" aria-label="Classifai home" onClick={(e) => { e.preventDefault(); onHome?.(); }}>
          <Logo size={36} />
        </a>
      </div>
      <div className="topbar-right">
        <button type="button" className="ask-pill" onClick={onAsk} aria-label="Ask Pandu">
          <span id="ask-slot" className="ask-slot" aria-hidden="true" />
          <span className="ask-text">Ask Pandu</span>
        </button>
      </div>
    </header>
  );
}
