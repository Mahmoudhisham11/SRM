"use client";

import { useSyncExternalStore } from "react";

/**
 * Cases the user deleted but can still undo. They're hidden at once and the
 * real delete runs when the undo window closes, so «تراجع» restores the case
 * exactly (including its audio, which a real delete would remove).
 *
 * If the page is hidden or closed during the undo window, pending deletes are
 * committed right away, so a case deleted just before closing the app stays
 * deleted (Firestore keeps the queued write even if the tab then dies).
 */
const hidden = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const commits = new Map<string, () => void>();
const listeners = new Set<() => void>();
let snapshot: ReadonlySet<string> = new Set();
const emit = () => {
  snapshot = new Set(hidden);
  listeners.forEach((l) => l());
};

export const UNDO_MS = 6000;

function commitNow(id: string) {
  const commit = commits.get(id);
  clearTimeout(timers.get(id));
  timers.delete(id);
  commits.delete(id);
  commit?.();
  hidden.delete(id);
  emit();
}

/** Commit every delete still waiting for its undo window. */
export function flushPendingDeletes() {
  for (const id of [...commits.keys()]) commitNow(id);
}

let listening = false;
function listenForPageHide() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  // pagehide: tab closed / navigated away. visibilitychange: the app was sent to
  // the background on a phone, where it may be killed without any other event.
  window.addEventListener("pagehide", flushPendingDeletes);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingDeletes();
  });
}

export function scheduleDelete(id: string, commit: () => void) {
  listenForPageHide();
  hidden.add(id);
  commits.set(id, commit);
  emit();
  timers.set(
    id,
    setTimeout(() => commitNow(id), UNDO_MS),
  );
}

export function undoDelete(id: string) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  commits.delete(id);
  hidden.delete(id);
  emit();
}

export function usePendingDeletes(): ReadonlySet<string> {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => snapshot,
    () => snapshot,
  );
}
