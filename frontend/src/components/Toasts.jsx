import { useToasts } from "../lib/toast";

export default function Toasts() {
  const toasts = useToasts();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast glass toast-${t.tone}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {t.tone === "ok" ? <path d="m5 12.6 4.4 4.4L19 7.4" /> : <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.6v5.4M12 16.2v.2" /></>}
          </svg>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
