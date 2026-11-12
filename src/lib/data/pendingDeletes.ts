"use client";

import { useSyncExternalStore } from "react";

/**
 * Cases the user deleted but can still undo. They're hidden at once and the
 * real delete runs when the undo window closes, so «تراجع» restores the case
 * exactly (including its audio, which a real delete would remove).
 */
const hidden = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();
let snapshot: ReadonlySet<string> = new Set();
const emit = () => {
  snapshot = new Set(hidden);
  listeners.forEach((l) => l());
};

export const UNDO_MS = 6000;

export function scheduleDelete(id: string, commit: () => void) {
  hidden.add(id);
  emit();
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id);
      commit();
      hidden.delete(id);
      emit();
    }, UNDO_MS),
  );
}

export function undoDelete(id: string) {
  clearTimeout(timers.get(id));
  timers.delete(id);
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
