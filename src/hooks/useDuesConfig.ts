"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useData } from "@/components/providers/DataProvider";
import { getFirebase } from "@/lib/firebase";
import { ROOT, SHARED } from "@/lib/data/firestoreRepo";
import { EMPTY_CONFIG, type AnalysisConfig } from "@/lib/dues/analysis";
import { fromStored, toStored } from "@/lib/dues/configStore";

/**
 * The Analysis lists (fixed / excluded / Masader vendors + per-invoice
 * decisions), shared by everyone through Firestore
 * (srmVoiceLog/shared/settings/duesAnalysis): upload them once on any device
 * and every other device gets them. A copy is kept on the device so the page
 * also works offline.
 *
 * If a device has lists that the shared copy doesn't (e.g. learned before
 * sharing worked), they're uploaded automatically.
 */
const LOCAL_KEY = "srm-voice-log:dues-analysis-config:v1";

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
/** Why the shared copy can't be used: the rules don't allow it, or another error (code). */
export type SharedProblem = null | { kind: "rules" } | { kind: "other"; code: string };

const errCode = (e: unknown) => String((e as { code?: string })?.code ?? (e as Error)?.message ?? e);
const problemOf = (e: unknown): SharedProblem => (/permission-denied/.test(errCode(e)) ? { kind: "rules" } : { kind: "other", code: errCode(e).slice(0, 80) });

async function writeShared(c: AnalysisConfig) {
  const { doc, setDoc } = await import("firebase/firestore");
  await setDoc(doc(getFirebase().db, ROOT, SHARED, "settings", "duesAnalysis"), { ...toStored(c), updatedAt: Date.now() });
}

export function useDuesConfig() {
  const { auth, demo } = useData();
  const [config, setConfig] = useState<AnalysisConfig | null>(null);
  const [source, setSource] = useState<ConfigSource>("loading");
  const [problem, setProblem] = useState<SharedProblem>(null);
  const uploading = useRef(false);
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
          const shared = snap.exists() ? fromStored(snap.data()) : null;
          if (shared) {
            setConfig(shared);
            setSource("shared");
            setProblem(null);
            writeLocal(shared);
            return;
          }
          // Nothing shared yet: show this device's lists and share them.
          setConfig(local);
          setSource(local ? "device" : "none");
          if (local && !uploading.current && !snap.metadata.fromCache) {
            uploading.current = true;
            writeShared(local)
              .then(() => setProblem(null))
              .catch((e) => setProblem(problemOf(e)))
              .finally(() => (uploading.current = false));
          }
        },
        (e) => {
          setProblem(problemOf(e));
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
        await writeShared(next);
        setProblem(null);
        setSource("shared");
      } catch (e) {
        setProblem(problemOf(e));
        setSource("device");
      }
    },
    [demo, signedIn],
  );

  return { config, source, problem: demo ? null : problem, demo, save, empty: EMPTY_CONFIG };
}
