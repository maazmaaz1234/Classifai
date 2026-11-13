import { useSyncExternalStore } from "react";

let toasts = [];
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

export function toast(message, tone = "ok") {
  const id = Math.random().toString(36).slice(2);
  toasts = [...toasts, { id, message, tone }];
  emit();
  setTimeout(() => { toasts = toasts.filter((t) => t.id !== id); emit(); }, 3600);
}

export const useToasts = () =>
  useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => toasts);
