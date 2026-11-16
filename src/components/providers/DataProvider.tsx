"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getFirebase, isAudioStorageEnabled, isFirebaseConfigured } from "@/lib/firebase";
import type { DataRepo } from "@/lib/data/repo";
import { LocalRepo } from "@/lib/data/localRepo";
import { FirestoreRepo } from "@/lib/data/firestoreRepo";
import { flushPendingAudio } from "@/lib/data/audioUpload";
import { createPendingProfile, watchProfile, type UserProfile } from "@/lib/auth/users";

export interface AppUser {
  uid: string;
  name: string;
  email: string;
  photoURL: string | null;
}

/**
 * - signedOut: show the sign-in / create-account screen
 * - pending:   signed in, waiting for an admin to approve the account
 * - disabled:  an admin turned the account off
 * - signedIn:  approved — full access to the shared data
 */
export type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "pending"; user: AppUser; profile: UserProfile | null; error?: string }
  | { status: "disabled"; user: AppUser; profile: UserProfile }
  | { status: "signedIn"; user: AppUser; profile: UserProfile; repo: DataRepo };

interface DataContextValue {
  auth: AuthState;
  demo: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(name: string, email: string, password: string): Promise<void>;
  resetPassword(email: string): Promise<void>;
  signOut(): Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

const DEMO_USER: AppUser = { uid: "demo", name: "", email: "", photoURL: null };
const DEMO_PROFILE: UserProfile = { uid: "demo", name: "", email: "", role: "admin", status: "approved", createdAt: 0, updatedAt: 0 };

export function DataProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const demo = !isFirebaseConfigured;
  /** Name typed on the sign-up form, used for the new account's profile. */
  const signUpName = useRef<string | null>(null);

  useEffect(() => {
    if (demo) {
      // LocalRepo needs window/localStorage, so it can only be created after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAuth({ status: "signedIn", user: DEMO_USER, profile: DEMO_PROFILE, repo: new LocalRepo() });
      return;
    }
    const { auth: fbAuth, db, storage } = getFirebase();
    let unsubAuth = () => {};
    let unsubProfile = () => {};
    let cancelled = false;
    import("firebase/auth").then(({ onAuthStateChanged }) => {
      if (cancelled) return;
      unsubAuth = onAuthStateChanged(fbAuth, (u) => {
        unsubProfile();
        unsubProfile = () => {};
        if (!u) return setAuth({ status: "signedOut" });
        const user: AppUser = { uid: u.uid, name: u.displayName ?? "", email: u.email ?? "", photoURL: null };
        let repo: FirestoreRepo | null = null;
        let creating = false;
        unsubProfile = watchProfile(
          db,
          u.uid,
          (profile) => {
            if (!profile) {
              // New account (or one an admin removed): ask for access again.
              setAuth({ status: "pending", user, profile: null });
              if (!creating) {
                creating = true;
                const name = signUpName.current || u.displayName || (u.email ?? "").split("@")[0];
                createPendingProfile(db, u.uid, name, u.email ?? "").catch((e) =>
                  setAuth({ status: "pending", user, profile: null, error: String((e as { code?: string }).code ?? e) }),
                );
              }
              return;
            }
            creating = false;
            const named = { ...user, name: profile.name || user.name };
            if (profile.status === "approved") {
              // Keep the same repo while the name doesn't change (a new repo re-subscribes every list).
              if (!repo || repo.actorName !== named.name) repo = new FirestoreRepo(db, storage, { uid: u.uid, name: named.name }, isAudioStorageEnabled);
              setAuth({ status: "signedIn", user: named, profile, repo });
            } else if (profile.status === "disabled") setAuth({ status: "disabled", user: named, profile });
            else setAuth({ status: "pending", user: named, profile });
          },
          (e) => setAuth({ status: "pending", user, profile: null, error: String((e as { code?: string }).code ?? e) }),
        );
      });
    });
    return () => {
      cancelled = true;
      unsubAuth();
      unsubProfile();
    };
  }, [demo]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { signInWithEmailAndPassword } = await import("firebase/auth");
    await signInWithEmailAndPassword(getFirebase().auth, email.trim(), password);
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const { createUserWithEmailAndPassword, updateProfile } = await import("firebase/auth");
    signUpName.current = name.trim();
    const { user } = await createUserWithEmailAndPassword(getFirebase().auth, email.trim(), password);
    await updateProfile(user, { displayName: name.trim() }).catch(() => undefined);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { sendPasswordResetEmail } = await import("firebase/auth");
    await sendPasswordResetEmail(getFirebase().auth, email.trim());
  }, []);

  const signOut = useCallback(async () => {
    if (demo) return;
    const { signOut: fbSignOut } = await import("firebase/auth");
    signUpName.current = null;
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

  const value = useMemo(() => ({ auth, demo, signIn, signUp, resetPassword, signOut }), [auth, demo, signIn, signUp, resetPassword, signOut]);
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

/** The signed-in, approved user's profile (role decides admin-only screens). */
export function useProfile(): UserProfile | null {
  const { auth } = useData();
  return auth.status === "signedIn" ? auth.profile : null;
}
