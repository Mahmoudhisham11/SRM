/**
 * Security-rules tests. Run with the emulators:  npm run test:rules
 * (needs Java; firebase-tools is fetched with npx).
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc, type Firestore } from "firebase/firestore";
import { ref, uploadBytes, getBytes } from "firebase/storage";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-srm-voice-log",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
    storage: { rules: readFileSync("storage.rules", "utf8"), host: "127.0.0.1", port: 9199 },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
});

const now = 1_700_000_000_000;
const S = "srmVoiceLog/shared";
const vendor = { nameAr: "المصرية للتغليف", nameEn: "", code: "10532", material: "Steel", contact: "", notes: "", createdAt: now, updatedAt: now };
const caseDoc = {
  vendorId: "v1", case: "تأخير توريد", taskBar: "متابعة", startDate: "2025-03-15", endDate: null,
  comments: "", status: "open", audioUrl: null, transcript: "", createdAt: now, updatedAt: now,
};

const as = (uid: string, email = `${uid}@x.com`) => env.authenticatedContext(uid, { email }).firestore() as unknown as Firestore;
const anon = () => env.unauthenticatedContext().firestore() as unknown as Firestore;

/** Write documents without rules (test setup). */
async function seed(write: (db: Firestore) => Promise<unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await write(ctx.firestore() as unknown as Firestore);
  });
}

describe("shared data", () => {
  it("everyone signed in reads and writes the same vendors and cases", async () => {
    await assertSucceeds(setDoc(doc(as("ann"), `${S}/vendors/v1`), vendor));
    await assertSucceeds(getDoc(doc(as("bob"), `${S}/vendors/v1`)));
    await assertSucceeds(getDocs(collection(as("bob"), `${S}/vendors`)));
    await assertSucceeds(setDoc(doc(as("bob"), `${S}/cases/c1`), { ...caseDoc, createdBy: "bob", createdByName: "Bob" }));
    await assertSucceeds(updateDoc(doc(as("ann"), `${S}/cases/c1`), { comments: "تم", updatedAt: now + 1 }));
    await assertSucceeds(deleteDoc(doc(as("ann"), `${S}/cases/c1`)));
  });
  it("signed-out visitors see nothing", async () => {
    await seed((db) => setDoc(doc(db, `${S}/vendors/v1`), vendor));
    await assertFails(getDoc(doc(anon(), `${S}/vendors/v1`)));
    await assertFails(getDocs(collection(anon(), `${S}/cases`)));
    await assertFails(setDoc(doc(anon(), `${S}/vendors/v2`), vendor));
  });
  it("a case can only carry your own uid, and it can't be changed", async () => {
    await assertFails(setDoc(doc(as("ann"), `${S}/cases/c1`), { ...caseDoc, createdBy: "bob" }));
    await assertSucceeds(setDoc(doc(as("ann"), `${S}/cases/c1`), { ...caseDoc, createdBy: "ann", createdByName: "Ann" }));
    await assertFails(updateDoc(doc(as("ann"), `${S}/cases/c1`), { createdBy: "bob" }));
  });
  it("still validates cases and vendors", async () => {
    await assertFails(setDoc(doc(as("ann"), `${S}/cases/c1`), { ...caseDoc, case: "" }));
    await assertFails(setDoc(doc(as("ann"), `${S}/cases/c1`), { ...caseDoc, endDate: "2025-03-01", status: "closed" }));
    await assertFails(setDoc(doc(as("ann"), `${S}/cases/c1`), { ...caseDoc, endDate: "2025-04-01", status: "open" }));
    await assertFails(setDoc(doc(as("ann"), `${S}/vendors/v1`), { ...vendor, nameAr: "", nameEn: "" }));
    await assertFails(setDoc(doc(as("ann"), `${S}/vendors/v1`), { ...vendor, rating: 5 }));
    const { material: _m, ...older } = vendor;
    void _m;
    await assertSucceeds(setDoc(doc(as("ann"), `${S}/vendors/v2`), older)); // vendors from before Material
  });
  it("shared settings: anyone signed in, nobody signed out", async () => {
    await assertSucceeds(setDoc(doc(as("ann"), `${S}/settings/duesAnalysis`), { fixedVendors: ["1"] }));
    await assertSucceeds(getDoc(doc(as("bob"), `${S}/settings/duesAnalysis`)));
    await assertFails(getDoc(doc(anon(), `${S}/settings/duesAnalysis`)));
  });
  it("nothing else in the app's folder is writable", async () => {
    await assertFails(setDoc(doc(as("ann"), `${S}/users/ann`), { name: "Ann" }));
    await assertFails(setDoc(doc(as("ann"), `${S}/meta/x`), { a: 1 }));
  });
});

describe("old per-person data", () => {
  it("is read-only for its owner and private", async () => {
    await seed((db) => setDoc(doc(db, "srmVoiceLog/alice/vendors/v1"), vendor));
    await assertSucceeds(getDoc(doc(as("alice"), "srmVoiceLog/alice/vendors/v1")));
    await assertFails(setDoc(doc(as("alice"), "srmVoiceLog/alice/vendors/v2"), vendor));
    await assertFails(getDoc(doc(as("bob"), "srmVoiceLog/alice/vendors/v1")));
    await assertSucceeds(deleteDoc(doc(as("alice"), "srmVoiceLog/alice/vendors/v1")));
  });
});

describe("storage", () => {
  const audio = new Uint8Array([1, 2, 3]);
  it("signed-in accounts share recordings; visitors can't read them", async () => {
    await assertSucceeds(uploadBytes(ref(env.authenticatedContext("ann").storage(), "srmVoiceLog/shared/audio/c1"), audio, { contentType: "audio/webm" }));
    await assertSucceeds(getBytes(ref(env.authenticatedContext("bob").storage(), "srmVoiceLog/shared/audio/c1")));
    await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), "srmVoiceLog/shared/audio/c1")));
  });
  it("only audio", async () => {
    await assertFails(uploadBytes(ref(env.authenticatedContext("ann").storage(), "srmVoiceLog/shared/audio/c2"), audio, { contentType: "text/html" }));
  });
});
