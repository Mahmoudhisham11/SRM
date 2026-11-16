"use client";

/**
 * One-time setup: makes the owner the first admin and moves their data.
 *
 * Before accounts, each person's data lived under srmVoiceLog/{their Google uid}.
 * Setup signs the owner in with Google one last time, links an email + password
 * to that SAME account (so the uid — and ownership — stays the same), makes
 * them an approved admin, and copies their vendors and cases into the shared
 * space. From then on everyone signs in with email and password.
 *
 * The rules only let the account that really owns old data do this, and only
 * once (see firestore.rules → meta/setup).
 */
import { EmailAuthProvider, GoogleAuthProvider, linkWithCredential, signInWithPopup, updatePassword, updateProfile, type Auth, type User } from "firebase/auth";
import { collection, doc, getDocs, limit, query, writeBatch, type Firestore } from "firebase/firestore";
import { ROOT, SHARED } from "../data/firestoreRepo";
import { setupDoc, userDoc, isSetupDone } from "./users";

export class SetupError extends Error {
  constructor(readonly reason: "alreadyDone" | "noLegacyData" | "noEmail") {
    super(reason);
  }
}

export interface SetupResult {
  email: string;
  vendors: number;
  cases: number;
}

async function firstId(db: Firestore, uid: string, sub: "vendors" | "cases"): Promise<string | null> {
  const snap = await getDocs(query(collection(db, ROOT, uid, sub), limit(1)));
  return snap.empty ? null : snap.docs[0].id;
}

async function googlePopup(auth: Auth): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return (await signInWithPopup(auth, provider)).user;
}

export async function runOwnerSetup(
  auth: Auth,
  db: Firestore,
  name: string,
  password: string,
  /** How to sign in with Google (a popup; replaceable in tests). */
  signInWithGoogle: (auth: Auth) => Promise<User> = googlePopup,
): Promise<SetupResult> {
  // The popup must open first, straight from the click: browsers block popups
  // opened after other awaits.
  const user = await signInWithGoogle(auth);
  if (await isSetupDone(db)) throw new SetupError("alreadyDone");
  const email = user.email;
  if (!email) throw new SetupError("noEmail");
  const uid = user.uid;

  // Proof of ownership: a vendor (or case) under this account's old folder.
  const proofVendor = await firstId(db, uid, "vendors");
  const proofCase = proofVendor ? null : await firstId(db, uid, "cases");
  if (!proofVendor && !proofCase) throw new SetupError("noLegacyData");

  // Same account, now also with a password. Linking is the standard way; if the
  // project reports the email as taken by this very account (it does in the
  // emulator, and with some project settings), setting the password directly
  // has the same effect.
  try {
    await linkWithCredential(user, EmailAuthProvider.credential(email, password));
  } catch (e) {
    const code = String((e as { code?: string }).code ?? "");
    if (code.includes("provider-already-linked") || code.includes("email-already-in-use") || code.includes("credential-already-in-use")) {
      await updatePassword(user, password);
    } else throw e;
  }
  await updateProfile(user, { displayName: name.trim() });

  // First admin + "setup done" marker, in one batch (the rules check both together).
  const now = Date.now();
  const first = writeBatch(db);
  first.set(userDoc(db, uid), { name: name.trim(), email: email.toLowerCase(), role: "admin", status: "approved", createdAt: now, updatedAt: now });
  first.set(setupDoc(db), { done: true, at: now, ...(proofVendor ? { legacyVendor: proofVendor } : { legacyCase: proofCase }) });
  await first.commit();

  return { email, ...(await copyLegacyData(db, uid)) };
}

/**
 * Copy this account's old vendors and cases into the shared space. Same ids,
 * so running it again (e.g. after a dropped connection) never duplicates.
 */
export async function copyLegacyData(db: Firestore, uid: string): Promise<{ vendors: number; cases: number }> {
  const counts = { vendors: 0, cases: 0 };
  for (const sub of ["vendors", "cases"] as const) {
    const snap = await getDocs(collection(db, ROOT, uid, sub));
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = writeBatch(db);
      for (const d of snap.docs.slice(i, i + 400)) batch.set(doc(db, ROOT, SHARED, sub, d.id), d.data());
      await batch.commit();
    }
    counts[sub] = snap.size;
  }
  return counts;
}

/** How many old vendors / cases this account still has in its old folder (0 when none or not readable). */
export async function legacyCounts(db: Firestore, uid: string): Promise<{ vendors: number; cases: number }> {
  try {
    const [v, c] = await Promise.all([getDocs(collection(db, ROOT, uid, "vendors")), getDocs(collection(db, ROOT, uid, "cases"))]);
    return { vendors: v.size, cases: c.size };
  } catch {
    return { vendors: 0, cases: 0 };
  }
}
