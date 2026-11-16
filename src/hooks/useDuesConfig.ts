"use client";

import { useCallback, useEffect, useState } from "react";
import { useData } from "@/components/providers/DataProvider";
import { getFirebase } from "@/lib/firebase";
import { ROOT, SHARED } from "@/lib/data/firestoreRepo";
import { EMPTY_CONFIG, type AnalysisConfig, type Placement } from "@/lib/dues/analysis";

/**
 * The Analysis lists (fixed / excluded / Masader vendors + per-invoice
 * decisions). Shared through Firestore (srmVoiceLog/shared/settings/duesAnalysis)
 * so everyone gets the same Analysis; kept on this device too, so the page
 * works offline and even before the Firestore rules allow the settings doc.
 */
const LOCAL_KEY = "srm-voice-log:dues-analysis-config:v1";

/** Stored form: exceptions as pairs (invoice numbers can contain characters Firestore field names dislike). */
interface StoredConfig extends Omit<AnalysisConfig, "exceptions"> {
  exceptionList: Array<[string, Placement]>;
}

const toStored = (c: AnalysisConfig): StoredConfig => {
  const { exceptions, ...rest } = c;
  return { ...rest, exceptionList: Object.entries(exceptions) };
};
const fromStored = (s: Partial<StoredConfig> | undefined | null): AnalysisConfig | null => {
  if (!s || !Array.isArray(s.fixedVendors)) return null;
  return {
    version: 1,
    fixedVendors: s.fixedVendors ?? [],
    excludedVendors: s.excludedVendors ?? [],
    masaderVendors: s.masaderVendors ?? [],
    exceptions: Object.fromEntries(s.exceptionList ?? []),
    vendorNames: s.vendorNames ?? {},
    learnedFrom: s.learnedFrom,
    learnedAt: s.learnedAt,
  };
};

function readLocal(): AnalysisConfig | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? fromStored(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
function writeLocal(c: AnalysisConfig) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(toStored(c)));
  } catch {
    /* storage full / private mode */
  }
}

export type ConfigSource = "loading" | "shared" | "device" | "none";

export function useDuesConfig() {
  const { auth, demo } = useData();
  const [config, setConfig] = useState<AnalysisConfig | null>(null);
  const [source, setSource] = useState<ConfigSource>("loading");
  /** True when the last save couldn't reach the shared copy (rules not updated yet). */
  const [sharedBlocked, setSharedBlocked] = useState(false);
  const signedIn = auth.status === "signedIn";

  useEffect(() => {
    const local = readLocal();
    if (demo || !signedIn) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConfig(local);
      setSource(local ? "device" : "none");
      return;
    }
    let unsub = () => {};
    let alive = true;
    import("firebase/firestore").then(({ doc, onSnapshot }) => {
      if (!alive) return;
      unsub = onSnapshot(
        doc(getFirebase().db, ROOT, SHARED, "settings", "duesAnalysis"),
        (snap) => {
          const shared = snap.exists() ? fromStored(snap.data() as Partial<StoredConfig>) : null;
          if (shared) {
            setConfig(shared);
            setSource("shared");
            writeLocal(shared);
          } else {
            setConfig(local);
            setSource(local ? "device" : "none");
          }
        },
        () => {
          // No access to the shared copy (rules not published yet): use this device's copy.
          setSharedBlocked(true);
          setConfig(local);
          setSource(local ? "device" : "none");
        },
      );
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [demo, signedIn]);

  const save = useCallback(
    async (next: AnalysisConfig) => {
      setConfig(next);
      writeLocal(next);
      if (demo || !signedIn) {
        setSource("device");
        return;
      }
      try {
        const { doc, setDoc } = await import("firebase/firestore");
        await setDoc(doc(getFirebase().db, ROOT, SHARED, "settings", "duesAnalysis"), { ...toStored(next), updatedAt: Date.now() });
        setSharedBlocked(false);
        setSource("shared");
      } catch {
        setSharedBlocked(true);
        setSource("device");
      }
    },
    [demo, signedIn],
  );

  return { config, source, sharedBlocked: sharedBlocked && !demo, demo, save, empty: EMPTY_CONFIG };
}
