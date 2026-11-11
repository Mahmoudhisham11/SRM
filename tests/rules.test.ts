/**
 * Security-rules tests. Run with the emulators:  npm run test:rules
 * (needs Java; firebase-tools is fetched with npx).
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
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
const vendor = { nameAr: "المصرية للتغليف", nameEn: "", code: "10532", contact: "", notes: "", createdAt: now, updatedAt: now };
const caseDoc = {
  vendorId: "v1", case: "تأخير توريد", taskBar: "متابعة", startDate: "2025-03-15", endDate: null,
  comments: "", status: "open", audioUrl: null, transcript: "", createdAt: now, updatedAt: now,
};

const alice = () => env.authenticatedContext("alice").firestore();
const bob = () => env.authenticatedContext("bob").firestore();
const anon = () => env.unauthenticatedContext().firestore();

describe("ownership", () => {
  it("owner can create/read/update/delete own vendor and case", async () => {
    const db = alice();
    await assertSucceeds(setDoc(doc(db, "users/alice/vendors/v1"), vendor));
    await assertSucceeds(getDoc(doc(db, "users/alice/vendors/v1")));
    await assertSucceeds(setDoc(doc(db, "users/alice/cases/c1"), caseDoc));
    await assertSucceeds(updateDoc(doc(db, "users/alice/cases/c1"), { endDate: "2025-03-20", status: "closed", updatedAt: now + 1 }));
    await assertSucceeds(deleteDoc(doc(db, "users/alice/cases/c1")));
  });

  it("other users cannot read or write someone else's data", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users/alice/cases/c1"), caseDoc);
    });
    await assertFails(getDoc(doc(bob(), "users/alice/cases/c1")));
    await assertFails(setDoc(doc(bob(), "users/alice/cases/c2"), caseDoc));
    await assertFails(deleteDoc(doc(bob(), "users/alice/cases/c1")));
  });

  it("signed-out users get nothing", async () => {
    await assertFails(getDoc(doc(anon(), "users/alice/cases/c1")));
    await assertFails(setDoc(doc(anon(), "users/alice/vendors/v1"), vendor));
  });

  it("paths outside users/{uid} are closed", async () => {
    await assertFails(setDoc(doc(alice(), "shared/x"), { a: 1 }));
  });
});

describe("case validation", () => {
  const put = (data: object) => setDoc(doc(alice(), "users/alice/cases/c1"), data);
  it("end date before start date is rejected", async () => {
    await assertFails(put({ ...caseDoc, endDate: "2025-03-10", status: "closed" }));
  });
  it("end date equal to start date is fine", async () => {
    await assertSucceeds(put({ ...caseDoc, endDate: "2025-03-15", status: "closed" }));
  });
  it("status must match end date", async () => {
    await assertFails(put({ ...caseDoc, status: "closed" }));
    await assertFails(put({ ...caseDoc, endDate: "2025-03-20", status: "open" }));
  });
  it("required fields and formats", async () => {
    await assertFails(put({ ...caseDoc, case: "" }));
    await assertFails(put({ ...caseDoc, startDate: "15-Mar-2025" }));
    await assertFails(put({ ...caseDoc, extra: true }));
  });
});

describe("vendor validation", () => {
  it("needs a name", async () => {
    await assertFails(setDoc(doc(alice(), "users/alice/vendors/v1"), { ...vendor, nameAr: "", nameEn: "" }));
    await assertSucceeds(setDoc(doc(alice(), "users/alice/vendors/v1"), { ...vendor, nameAr: "", nameEn: "Nile" }));
  });
});

describe("storage", () => {
  const audio = new Uint8Array([1, 2, 3]);
  it("owner can upload and read audio", async () => {
    const st = env.authenticatedContext("alice").storage();
    await assertSucceeds(uploadBytes(ref(st, "users/alice/audio/c1"), audio, { contentType: "audio/webm" }));
    await assertSucceeds(getBytes(ref(st, "users/alice/audio/c1")));
  });
  it("others cannot read; non-audio rejected", async () => {
    await assertFails(getBytes(ref(env.authenticatedContext("bob").storage(), "users/alice/audio/c1")));
    await assertFails(uploadBytes(ref(env.authenticatedContext("alice").storage(), "users/alice/audio/c2"), audio, { contentType: "text/html" }));
  });
});
