import { useCallback, useEffect, useState } from "react";
import "./App.css";
import "./pages.css";
import "./extras.css";
import "./components.css";
import "./chat.css";
import "./dock.css";
import "./motion.css";
import Background from "./components/Background";
import Header from "./components/Header";
import Dock from "./components/Dock";
import PanduFlight from "./components/PanduFlight";
import ChatWindow from "./components/ChatWindow";
import Toasts from "./components/Toasts";
import Splash from "./components/Splash";
import Auth from "./components/Auth";
import SettingsModal from "./components/SettingsModal";
import CustomerPageHost from "./components/CustomerPage";
import { PasswordGateHost } from "./components/PasswordGate";
import Home from "./pages/Home";
import Customers from "./pages/Customers";
import Dashboard from "./pages/Dashboard";
import Model from "./pages/Model";
import Support from "./pages/Support";
import { useData } from "./lib/store";
import { toast } from "./lib/toast";
import { restoreSession, signOut, useAuthBooting, useAuthPhase, useSession } from "./lib/auth";
import { fx, ui } from "./lib/ui";
import { initTilt } from "./lib/tilt";

const PAGES = [
  { id: "home", label: "Home" },
  { id: "customers", label: "Customers" },
  { id: "dashboard", label: "Dashboard" },
  { id: "model", label: "Model" },
  { id: "support", label: "Support" },
];

function Workspace({ ready, user, onPage }) {
  const data = useData();
  const [activeIdx, setActiveIdx] = useState(0);
  const [settings, setSettings] = useState(false);
  useEffect(() => { onPage(activeIdx); }, [activeIdx, onPage]);
  const [docked, setDocked] = useState(false);
  const [chat, setChat] = useState({ open: false, seed: null });
  useEffect(() => { document.documentElement.dataset.docked = docked ? "true" : "false"; }, [docked]);

  // Page-to-page scrolling uses the browser's own smooth scroll (it runs off the main thread, so it stays fluid).
  const goTo = useCallback((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY, behavior: reduced ? "auto" : "smooth" });
  }, []);

  // While you scroll we only work out two things – which page is current and whether Pandu should be docked.
  // The 3D fly-in of every card is done by CSS scroll-driven animations (see .depth), not by JavaScript.
  useEffect(() => {
    const els = PAGES.map((p) => document.getElementById(p.id));
    const root = document.documentElement;
    let ticking = false;
    let dockedNow = false;
    let stopTimer = 0;
    let scrolling = false;
    let current = -1;

    const update = () => {
      ticking = false;
      const vh = window.innerHeight;
      let best = 0;
      let bestVis = -1;
      els.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        const vis = Math.min(r.bottom, vh) - Math.max(r.top, 0);
        if (vis > bestVis) { bestVis = vis; best = i; }
      });
      if (best !== current) {
        current = best;
        els.forEach((el, i) => { el.dataset.active = i === best ? "true" : "false"; });
        setActiveIdx(best);
      }
      const y = window.scrollY;
      if (!dockedNow && y > vh * 0.2) { dockedNow = true; setDocked(true); }
      else if (dockedNow && y < vh * 0.1) { dockedNow = false; setDocked(false); }
    };

    const onScroll = () => {
      if (!scrolling) { scrolling = true; root.dataset.scrolling = "true"; }   // pauses ambient animations
      clearTimeout(stopTimer);
      stopTimer = setTimeout(() => { scrolling = false; root.dataset.scrolling = "false"; }, 160);
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      clearTimeout(stopTimer);
      root.dataset.scrolling = "false";
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", update);
    };
  }, []);

  // The page content can change height (dashboard data), so re-measure after layout changes.
  useEffect(() => { window.dispatchEvent(new Event("resize")); }, [data]);

  const openChat = useCallback((text) => {
    setChat({ open: true, seed: text ? { id: Date.now(), text } : null });
  }, []);
  const closeChat = useCallback(() => setChat((c) => ({ ...c, open: false })), []);

  return (
    <div className="app">
      <Header
        user={user}
        onLogout={() => { toast("Signed out"); signOut(); }}
        onAsk={() => openChat()}
        onHome={() => goTo("home")}
        onSettings={() => setSettings(true)}
      />
      <main>
        <Home />
        <Customers onGo={goTo} />
        <Dashboard onGo={goTo} onAsk={openChat} />
        <Model onAsk={openChat} />
        <Support onAsk={openChat} onGo={goTo} />
      </main>
      <PanduFlight docked={docked} ready={ready} onOpenChat={() => openChat()} />
      <Dock items={PAGES} active={PAGES[activeIdx].id} onSelect={goTo} />
      <ChatWindow open={chat.open} seed={chat.seed} onClose={closeChat} />
      <CustomerPageHost onGo={goTo} onAsk={openChat} />
      {settings && <SettingsModal onClose={() => setSettings(false)} />}
      <PasswordGateHost />
    </div>
  );
}

export default function App() {
  const session = useSession();
  const phase = useAuthPhase();
  const booting = useAuthBooting();
  const [ready, setReady] = useState(false);   // the intro has revealed the page
  const [pageIdx, setPageIdx] = useState(0);
  const reveal = useCallback(() => setReady(true), []);

  // Signing in: the ribbon surges across the screen (one shared background, so it carries straight into the workspace).
  useEffect(() => {
    if (phase !== "entering") return undefined;
    const release = ui.pushScene("enter");
    fx.speed = 2.4;
    const id = setTimeout(() => { fx.speed = 0; }, 1100);
    return () => { release(); clearTimeout(id); fx.speed = 0; };
  }, [phase]);

  useEffect(() => { document.documentElement.dataset.ready = ready ? "true" : "false"; }, [ready]);
  useEffect(() => initTilt(), []);   // panels lean toward the cursor, on every page including sign-in
  useEffect(() => { restoreSession(); }, []);   // already signed in on this browser? (asks the server)

  // Lock scrolling while the intro plays, and always while the sign-in screen is up.
  useEffect(() => {
    if (ready && session) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [ready, session]);

  // A new account starts at the top of Home.
  useEffect(() => { if (session) window.scrollTo(0, 0); }, [session]);

  return (
    <>
      <Background page={session ? pageIdx : 0} />
      {session ? <Workspace key={session.email} ready={ready} user={session} onPage={setPageIdx} /> : <Auth ready={ready} leaving={phase === "entering"} />}
      <Toasts />
      <Splash onReveal={reveal} />
    </>
  );
}
