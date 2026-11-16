/**
 * One-time owner setup, end to end against the emulators (auth + firestore):
 * old Google account → password linked to the same account → first admin →
 * old data copied into the shared space. Run with:  npm run test:rules
 */
import { beforeAll, test, expect } from "vitest";
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, GoogleAuthProvider, signInWithCredential, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { connectFirestoreEmulator, initializeFirestore, doc, getDoc, getDocs, collection, setDoc } from "firebase/firestore";
import { runOwnerSetup, SetupError } from "../src/lib/auth/setup";
import { isSetupDone } from "../src/lib/auth/users";

beforeAll(async () => {
  // Start from empty emulators.
  await fetch("http://127.0.0.1:9099/emulator/v1/projects/demo-srm-voice-log/accounts", { method: "DELETE" });
  await fetch("http://127.0.0.1:8080/emulator/v1/projects/demo-srm-voice-log/databases/(default)/documents", { method: "DELETE" });
});

test("owner setup against the emulators", async () => {
  const app = initializeApp({ apiKey: "demo-key", projectId: "demo-srm-voice-log", appId: "1:1:web:1", authDomain: "demo-srm-voice-log.firebaseapp.com" }, "e2e");
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const db = initializeFirestore(app, { experimentalForceLongPolling: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);

  const google = () => signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: "owner-google", email: "Owner@Company.com", email_verified: true, name: "Owner" }))).then((c) => c.user);
  // Seed old data as the owner's Google account (admin REST, bypasses rules).
  const u = await google();
  const put = async (path: string, fields: Record<string, unknown>) => {
    const r = await fetch(`http://127.0.0.1:8080/v1/projects/demo-srm-voice-log/databases/(default)/documents/${path}`, {
      method: "PATCH", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    });
    if (!r.ok) throw new Error(await r.text());
  };
  const s = (v: string) => ({ stringValue: v });
  const n = (v: number) => ({ integerValue: String(v) });
  for (let i = 0; i < 3; i++) await put(`srmVoiceLog/${u.uid}/vendors/v${i}`, { nameAr: s(`مورد ${i}`), nameEn: s(""), code: s(`1000${i}`), material: s("Steel"), contact: s(""), notes: s(""), createdAt: n(1), updatedAt: n(1) });
  await put(`srmVoiceLog/${u.uid}/cases/c1`, { vendorId: s("v0"), case: s("تأخير"), taskBar: s(""), startDate: s("2025-03-01"), endDate: { nullValue: null }, comments: s(""), status: s("open"), audioUrl: { nullValue: null }, transcript: s(""), createdAt: n(1), updatedAt: n(1) });
  await signOut(auth);

  expect(await isSetupDone(db)).toBe(false);
  const res = await runOwnerSetup(auth, db, "Mahmoud", "s3cret-pass!", google);
  expect({ ...res, email: res.email.toLowerCase() }).toEqual({ email: "owner@company.com", vendors: 3, cases: 1 });
  const uid = auth.currentUser!.uid;
  expect(uid).toBe(u.uid); // same account
  const me = (await getDoc(doc(db, "srmVoiceLog/shared/users", uid))).data();
  expect(me).toMatchObject({ name: "Mahmoud", email: "owner@company.com", role: "admin", status: "approved" });
  expect((await getDocs(collection(db, "srmVoiceLog/shared/vendors"))).size).toBe(3);
  expect((await getDocs(collection(db, "srmVoiceLog/shared/cases"))).size).toBe(1);
  expect(await isSetupDone(db)).toBe(true);

  // From now on: email + password, same uid.
  await signOut(auth);
  const cred = await signInWithEmailAndPassword(auth, "owner@company.com", "s3cret-pass!");
  expect(cred.user.uid).toBe(uid);

  // Setup can't run twice.
  await signOut(auth);
  await expect(runOwnerSetup(auth, db, "X", "another-pass", google)).rejects.toBeInstanceOf(SetupError);

  // Someone else can't fake old data any more (old folders are read-only).
  const other = await signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: "intruder", email: "intruder@x.com", email_verified: true })));
  await expect(setDoc(doc(db, `srmVoiceLog/${other.user.uid}/vendors/fake`), { nameAr: "x" })).rejects.toThrow();
}, 60000);
