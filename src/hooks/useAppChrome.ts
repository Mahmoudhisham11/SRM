"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useData } from "@/components/providers/DataProvider";
import { useDisplayName } from "./useVoicePrefs";

/** Name for greetings: the one set in Settings, else the Google first name. */
export function useGreetingName(): string {
  const [custom] = useDisplayName();
  const { auth } = useData();
  if (custom.trim()) return custom.trim();
  if (auth.status === "signedIn") return auth.user.name.trim().split(/\s+/)[0] ?? "";
  return "";
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

/**
 * The center mic in the bottom nav / sidebar "Log session".
 * A vendor page that is open claims it (starts logging right there);
 * elsewhere the shell shows the vendor picker.
 */
const MIC_EVENT = "srm:mic";
let claimed = 0;

export function useClaimMic(handler: () => void) {
  useEffect(() => {
    claimed++;
    const on = () => handler();
    window.addEventListener(MIC_EVENT, on);
    return () => {
      claimed--;
      window.removeEventListener(MIC_EVENT, on);
    };
  }, [handler]);
}

/** Returns true if a page handled the mic press. */
export function pressMic(): boolean {
  if (claimed === 0) return false;
  window.dispatchEvent(new Event(MIC_EVENT));
  return true;
}
