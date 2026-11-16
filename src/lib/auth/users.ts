"use client";

/**
 * Accounts and approval.
 *
 *   srmVoiceLog/shared/users/{uid}  { name, email, role, status, createdAt, updatedAt }
 *   srmVoiceLog/shared/meta/setup   { done, at, legacyVendor }  (written once, by the first admin)
 *
 * Anyone can create an account (name, email, password); it starts "pending"
 * and sees nothing until an admin approves it. firestore.rules enforce this.
 */
import { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, getDoc, type Firestore } from "firebase/firestore";
import { ROOT, SHARED } from "../data/firestoreRepo";

export { SHARED };

export type UserRole = "admin" | "member";
export type UserStatus = "pending" | "approved" | "disabled";

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: number;
  updatedAt: number;
}

export const usersCol = (db: Firestore) => collection(db, ROOT, SHARED, "users");
export const userDoc = (db: Firestore, uid: string) => doc(db, ROOT, SHARED, "users", uid);
export const setupDoc = (db: Firestore) => doc(db, ROOT, SHARED, "meta", "setup");

export function toProfile(uid: string, d: Partial<UserProfile> | undefined): UserProfile | null {
  if (!d) return null;
  return {
    uid,
    name: d.name ?? "",
    email: d.email ?? "",
    role: d.role === "admin" ? "admin" : "member",
    status: d.status === "approved" || d.status === "disabled" ? d.status : "pending",
    createdAt: typeof d.createdAt === "number" ? d.createdAt : 0,
    updatedAt: typeof d.updatedAt === "number" ? d.updatedAt : 0,
  };
}

/** Live profile of one user (null while it doesn't exist). */
export function watchProfile(db: Firestore, uid: string, onData: (p: UserProfile | null) => void, onError: (e: Error) => void) {
  return onSnapshot(userDoc(db, uid), (s) => onData(s.exists() ? toProfile(uid, s.data() as Partial<UserProfile>) : null), onError);
}

/** A new account's profile: always a pending member (the rules allow nothing else). */
export function createPendingProfile(db: Firestore, uid: string, name: string, email: string) {
  const now = Date.now();
  return setDoc(userDoc(db, uid), { name: name.trim(), email: email.trim().toLowerCase(), role: "member", status: "pending", createdAt: now, updatedAt: now });
}

/** Admin: every account, newest first. */
export function watchUsers(db: Firestore, onData: (users: UserProfile[]) => void, onError: (e: Error) => void) {
  return onSnapshot(
    usersCol(db),
    (snap) => onData(snap.docs.map((d) => toProfile(d.id, d.data() as Partial<UserProfile>)!).sort((a, b) => b.createdAt - a.createdAt)),
    onError,
  );
}

export function setUserStatus(db: Firestore, uid: string, status: UserStatus) {
  return updateDoc(userDoc(db, uid), { status, updatedAt: Date.now() });
}

export function setUserRole(db: Firestore, uid: string, role: UserRole) {
  return updateDoc(userDoc(db, uid), { role, updatedAt: Date.now() });
}

/** Admin: remove an account's profile (the person can't get back in without signing up again and being approved). */
export function removeUser(db: Firestore, uid: string) {
  return deleteDoc(userDoc(db, uid));
}

/** Own name (shown in greetings and on the cases you log). */
export function renameSelf(db: Firestore, uid: string, name: string) {
  return updateDoc(userDoc(db, uid), { name: name.trim(), updatedAt: Date.now() });
}

/** Has the one-time setup (first admin + data move) been done? Readable without signing in. */
export async function isSetupDone(db: Firestore): Promise<boolean> {
  try {
    return (await getDoc(setupDoc(db))).exists();
  } catch {
    return true; // can't tell (offline / rules not deployed): don't offer setup
  }
}
