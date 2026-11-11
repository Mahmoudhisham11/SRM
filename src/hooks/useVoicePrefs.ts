"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Small persisted preferences shared across components.
 * - defaultYear: per browser *session* (sessionStorage) — a back-fill session
 *   for last year shouldn't leak into tomorrow's normal logging.
 * - mode / recordAudio: remembered (localStorage).
 */
type Store = "session" | "local";

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

function read(store: Store, key: string): string | null {
  try {
    return (store === "session" ? sessionStorage : localStorage).getItem(key);
  } catch {
    return null;
  }
}
function write(store: Store, key: string, value: string) {
  try {
    (store === "session" ? sessionStorage : localStorage).setItem(key, value);
  } catch {
    /* storage blocked: value just won't persist */
  }
  memory.set(key, value);
  emit();
}
const memory = new Map<string, string>();

function usePref<T extends string>(store: Store, key: string, fallback: T): [T, (v: T) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => (read(store, key) ?? memory.get(key) ?? fallback) as T,
    () => fallback,
  );
  const set = useCallback((v: T) => write(store, key, v), [store, key]);
  return [value, set];
}

export function useDefaultYear(): [number, (y: number) => void] {
  const current = String(new Date().getFullYear());
  const [v, set] = usePref("session", "srm:defaultYear", current);
  return [Number(v) || Number(current), (y: number) => set(String(y))];
}

export type VoiceMode = "guided" | "free";
export function useVoiceMode() {
  return usePref<VoiceMode>("local", "srm:mode", "guided");
}

export function useRecordAudio(): [boolean, (v: boolean) => void] {
  const [v, set] = usePref<"1" | "0">("local", "srm:recordAudio", "1");
  return [v === "1", (b: boolean) => set(b ? "1" : "0")];
}
