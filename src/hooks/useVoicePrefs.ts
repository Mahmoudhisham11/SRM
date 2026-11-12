"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Gender, Lang } from "@/lib/i18n/messages";

/**
 * Small persisted preferences shared across components.
 * - defaultYear: per browser *session* (sessionStorage) — a back-fill session
 *   for last year shouldn't leak into tomorrow's normal logging.
 * - everything else: remembered on this device (localStorage).
 */
type Store = "session" | "local";

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const memory = new Map<string, string>();

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

function usePref<T extends string>(store: Store, key: string, fallback: T): [T, (v: T) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => (read(store, key) ?? memory.get(key) ?? fallback) as T,
    () => fallback,
  );
  const set = useCallback((v: T) => write(store, key, v), [store, key]);
  return [value, set];
}

/** Keys also read by the pre-paint script in layout.tsx — keep in sync. */
export const PREF_KEYS = { lang: "srm:lang", theme: "srm:theme" } as const;

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

export function useLang() {
  return usePref<Lang>("local", PREF_KEYS.lang, "ar");
}

export type ThemePref = "light" | "evening" | "system";
export function useThemePref() {
  return usePref<ThemePref>("local", PREF_KEYS.theme, "light");
}

export function useGender() {
  return usePref<Gender>("local", "srm:gender", "f");
}

/** Name used in greetings; empty = use the Google account's first name. */
export function useDisplayName() {
  return usePref<string>("local", "srm:name", "");
}

export type DictationLang = "ar-EG" | "en-US";
export function useDictationLang() {
  return usePref<DictationLang>("local", "srm:dictation", "ar-EG");
}

/** Cases saved in this browser session (for the "N this session" chip). */
export function useSessionCount(): [number, () => void] {
  const [v, set] = usePref<string>("session", "srm:sessionCount", "0");
  const n = Number(v) || 0;
  return [n, () => set(String(n + 1))];
}
