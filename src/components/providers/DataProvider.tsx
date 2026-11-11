"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getFirebase, isFirebaseConfigured } from "@/lib/firebase";
import type { DataRepo } from "@/lib/data/repo";
import { LocalRepo } from "@/lib/data/localRepo";
import { FirestoreRepo } from "@/lib/data/firestoreRepo";

export interface AppUser {
  uid: string;
  name: string;
  email: string;
  photoURL: string | null;
}

type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; user: AppUser; repo: DataRepo };

interface DataContextValue {
  auth: AuthState;
  demo: boolean;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

const DEMO_USER: AppUser = { uid: "demo", name: "وضع تجريبي", email: "", photoURL: null };

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
    // Lazy-load auth listener; also completes a redirect sign-in if one is pending.
    import("firebase/auth").then(({ onAuthStateChanged, getRedirectResult, GoogleAuthProvider, signInWithCredential }) => {
      getRedirectResult(fbAuth).catch(() => undefined);
      if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "1") {
        // Emulator-only hook for automated tests (the Auth emulator accepts
        // unsigned fake Google credentials). Never present in production builds.
        (window as unknown as Record<string, unknown>).__emulatorSignIn = (email: string) =>
          signInWithCredential(fbAuth, GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true, name: email.split("@")[0] })));
      }
      unsub = onAuthStateChanged(fbAuth, (u) => {
        if (!u) return setAuth({ status: "signedOut" });
        setAuth({
          status: "signedIn",
          user: { uid: u.uid, name: u.displayName ?? "", email: u.email ?? "", photoURL: u.photoURL },
          repo: new FirestoreRepo(db, storage, u.uid),
        });
      });
    });
    return () => unsub();
  }, [demo]);

  const signIn = useCallback(async () => {
    const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = await import("firebase/auth");
    const { auth: fbAuth } = getFirebase();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      await signInWithPopup(fbAuth, provider);
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      // Some mobile browsers block popups — fall back to a full-page redirect.
      if (code.includes("popup-blocked") || code.includes("operation-not-supported")) {
        await signInWithRedirect(fbAuth, provider);
      } else throw e;
    }
  }, []);

  const signOut = useCallback(async () => {
    if (demo) return;
    const { signOut: fbSignOut } = await import("firebase/auth");
    await fbSignOut(getFirebase().auth);
  }, [demo]);

  const value = useMemo(() => ({ auth, demo, signIn, signOut }), [auth, demo, signIn, signOut]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData outside DataProvider");
  return ctx;
}

/** Repo for signed-in pages (AuthGate guarantees it exists below it). */
export function useRepo(): DataRepo {
  const { auth } = useData();
  if (auth.status !== "signedIn") throw new Error("useRepo before sign-in");
  return auth.repo;
}
