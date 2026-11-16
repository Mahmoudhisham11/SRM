"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getFirebase, isAudioStorageEnabled, isFirebaseConfigured } from "@/lib/firebase";
import type { DataRepo } from "@/lib/data/repo";
import { LocalRepo } from "@/lib/data/localRepo";
import { FirestoreRepo } from "@/lib/data/firestoreRepo";
import { flushPendingAudio } from "@/lib/data/audioUpload";
import { usernameEmail } from "@/lib/auth/username";

export interface AppUser {
  uid: string;
  name: string;
}

/** Signed in = full access to the shared data (no roles, no approval). */
export type AuthState = { status: "loading" } | { status: "signedOut" } | { status: "signedIn"; user: AppUser; repo: DataRepo };

interface DataContextValue {
  auth: AuthState;
  demo: boolean;
  signIn(name: string, password: string): Promise<void>;
  signUp(name: string, password: string): Promise<void>;
  rename(name: string): Promise<void>;
  signOut(): Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

const DEMO_USER: AppUser = { uid: "demo", name: "" };

export function DataProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const demo = !isFirebaseConfigured;

  useEffect(() => {
    if (demo) {
      // LocalRepo needs window/localStorage, so it can only be created after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAuth({ status: "signedIn", user: DEMO_USER, repo: new LocalRepo() });
      return;
    }
    const { auth: fbAuth, db, storage } = getFirebase();
    let unsub = () => {};
    let cancelled = false;
    import("firebase/auth").then(({ onAuthStateChanged }) => {
      if (cancelled) return;
      unsub = onAuthStateChanged(fbAuth, (u) => {
        if (!u) return setAuth({ status: "signedOut" });
        const user = { uid: u.uid, name: u.displayName ?? "" };
        setAuth({ status: "signedIn", user, repo: new FirestoreRepo(db, storage, user, isAudioStorageEnabled) });
      });
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [demo]);

  const signIn = useCallback(async (name: string, password: string) => {
    const { signInWithEmailAndPassword } = await import("firebase/auth");
    await signInWithEmailAndPassword(getFirebase().auth, await usernameEmail(name), password);
  }, []);

  const signUp = useCallback(async (name: string, password: string) => {
    const { createUserWithEmailAndPassword, updateProfile } = await import("firebase/auth");
    const { auth: fbAuth, db, storage } = getFirebase();
    const display = name.replace(/\s+/g, " ").trim();
    const { user } = await createUserWithEmailAndPassword(fbAuth, await usernameEmail(name), password);
    await updateProfile(user, { displayName: display });
    // onAuthStateChanged fired before the name was saved: refresh it.
    const me = { uid: user.uid, name: display };
    setAuth({ status: "signedIn", user: me, repo: new FirestoreRepo(db, storage, me, isAudioStorageEnabled) });
  }, []);

  /** Change the name shown in greetings and on the cases you log (sign-in name stays the same). */
  const rename = useCallback(async (name: string) => {
    const { updateProfile } = await import("firebase/auth");
    const { auth: fbAuth, db, storage } = getFirebase();
    const u = fbAuth.currentUser;
    if (!u) return;
    const display = name.replace(/\s+/g, " ").trim();
    await updateProfile(u, { displayName: display });
    const me = { uid: u.uid, name: display };
    setAuth({ status: "signedIn", user: me, repo: new FirestoreRepo(db, storage, me, isAudioStorageEnabled) });
  }, []);

  const signOut = useCallback(async () => {
    if (demo) return;
    const { signOut: fbSignOut } = await import("firebase/auth");
    await fbSignOut(getFirebase().auth);
  }, [demo]);

  // Recordings saved while offline: upload them now and whenever the connection returns.
  const repo = auth.status === "signedIn" ? auth.repo : null;
  useEffect(() => {
    if (!repo || repo.kind !== "firestore") return;
    const flush = () => void flushPendingAudio(repo);
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [repo]);

  const value = useMemo(() => ({ auth, demo, signIn, signUp, rename, signOut }), [auth, demo, signIn, signUp, rename, signOut]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData outside DataProvider");
  return ctx;
}

/** Repo for signed-in pages (AppShell guarantees it exists below it). */
export function useRepo(): DataRepo {
  const { auth } = useData();
  if (auth.status !== "signedIn") throw new Error("useRepo before sign-in");
  return auth.repo;
}
