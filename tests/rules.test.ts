/**
 * Security-rules tests. Run with the emulators:  npm run test:rules
 * (needs Java; firebase-tools is fetched with npx).
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch, type Firestore } from "firebase/firestore";
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
const profile = (name: string, email: string, role = "member", status = "pending") => ({ name, email, role, status, createdAt: now, updatedAt: now });

const as = (uid: string, email = `${uid}@x.com`) => env.authenticatedContext(uid, { email }).firestore() as unknown as Firestore;
const anon = () => env.unauthenticatedContext().firestore() as unknown as Firestore;

/** Write documents without rules (test setup). */
async function seed(write: (db: Firestore) => Promise<unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await write(ctx.firestore() as unknown as Firestore);
  });
}
const seedUser = (uid: string, role = "member", status = "approved") => seed((db) => setDoc(doc(db, `${S}/users/${uid}`), profile(uid, `${uid}@x.com`, role, status)));

describe("sign-up", () => {
  it("a new account can create its own profile only as a pending member", async () => {
    await assertSucceeds(setDoc(doc(as("ann"), `${S}/users/ann`), profile("Ann", "ann@x.com")));
  });
  it("can't sign itself up as approved, as admin, for someone else, or with another email", async () => {
    await assertFails(setDoc(doc(as("ann"), `${S}/users/ann`), profile("Ann", "ann@x.com", "member", "approved")));
    await assertFails(setDoc(doc(as("ann"), `${S}/users/ann`), profile("Ann", "ann@x.com", "admin", "pending")));
    await assertFails(setDoc(doc(as("ann"), `${S}/users/bob`), profile("Bob", "ann@x.com")));
    await assertFails(setDoc(doc(as("ann"), `${S}/users/ann`), profile("Ann", "boss@x.com")));
    await assertFails(setDoc(doc(anon(), `${S}/users/ann`), profile("Ann", "ann@x.com")));
  });
  it("a pending account can't promote itself", async () => {
    await seedUser("ann", "member", "pending");
    await assertFails(updateDoc(doc(as("ann"), `${S}/users/ann`), { status: "approved" }));
    await assertFails(updateDoc(doc(as("ann"), `${S}/users/ann`), { role: "admin" }));
    await assertSucceeds(updateDoc(doc(as("ann"), `${S}/users/ann`), { name: "Ann M.", updatedAt: now + 1 }));
  });
});

describe("shared data", () => {
  it("approved accounts all read and write the same vendors and cases", async () => {
    await seedUser("ann");
    await seedUser("bob");
    await assertSucceeds(setDoc(doc(as("ann"), `${S}/vendors/v1`), vendor));
    await assertSucceeds(getDoc(doc(as("bob"), `${S}/vendors/v1`)));
    await assertSucceeds(setDoc(doc(as("bob"), `${S}/cases/c1`), { ...caseDoc, createdBy: "bob", createdByName: "Bob" }));
    await assertSucceeds(updateDoc(doc(as("ann"), `${S}/cases/c1`), { comments: "تم", updatedAt: now + 1 }));
    await assertSucceeds(getDocs(collection(as("ann"), `${S}/cases`)));
  });
  it("pending, turned-off, unknown and signed-out accounts see nothing", async () => {
    await seedUser("ann");
    await seedUser("pat", "member", "pending");
    await seedUser("dan", "member", "disabled");
    await assertSucceeds(setDoc(doc(as("ann"), `${S}/vendors/v1`), vendor));
    for (const db of [as("pat"), as("dan"), as("eve"), anon()]) {
      await assertFails(getDoc(doc(db, `${S}/vendors/v1`)));
      await assertFails(getDocs(collection(db, `${S}/vendors`)));
      await assertFails(setDoc(doc(db, `${S}/vendors/v2`), vendor));
    }
  });
  it("a case can only carry your own uid, and it can't be changed", async () => {
    await seedUser("ann");
    await assertFails(setDoc(doc(as("ann"), `${S}/cases/c1`), { ...caseDoc, createdBy: "bob" }));
    await assertSucceeds(setDoc(doc(as("ann"), `${S}/cases/c1`), { ...caseDoc, createdBy: "ann", createdByName: "Ann" }));
    await assertFails(updateDoc(doc(as("ann"), `${S}/cases/c1`), { createdBy: "bob" }));
  });
  it("still validates cases and vendors", async () => {
    await seedUser("ann");
    await assertFails(setDoc(doc(as("ann"), `${S}/cases/c1`), { ...caseDoc, case: "" }));
    await assertFails(setDoc(doc(as("ann"), `${S}/cases/c1`), { ...caseDoc, endDate: "2025-03-01", status: "closed" }));
    await assertFails(setDoc(doc(as("ann"), `${S}/cases/c1`), { ...caseDoc, endDate: "2025-04-01", status: "open" }));
    await assertFails(setDoc(doc(as("ann"), `${S}/vendors/v1`), { ...vendor, nameAr: "", nameEn: "" }));
    await assertFails(setDoc(doc(as("ann"), `${S}/vendors/v1`), { ...vendor, rating: 5 }));
    const { material: _m, ...older } = vendor;
    void _m;
    await assertSucceeds(setDoc(doc(as("ann"), `${S}/vendors/v2`), older)); // vendors from before Material
  });
});

describe("admin", () => {
  it("approves, turns off, promotes and removes others", async () => {
    await seedUser("boss", "admin");
    await seedUser("pat", "member", "pending");
    const db = as("boss");
    await assertSucceeds(getDocs(collection(db, `${S}/users`)));
    await assertSucceeds(updateDoc(doc(db, `${S}/users/pat`), { status: "approved", updatedAt: now + 1 }));
    await assertSucceeds(updateDoc(doc(db, `${S}/users/pat`), { role: "admin", updatedAt: now + 2 }));
    await assertSucceeds(updateDoc(doc(db, `${S}/users/pat`), { status: "disabled", updatedAt: now + 3 }));
    await assertFails(updateDoc(doc(db, `${S}/users/pat`), { email: "other@x.com" }));
    await assertSucceeds(deleteDoc(doc(db, `${S}/users/pat`)));
  });
  it("can't demote, turn off or remove themselves (there's always an admin)", async () => {
    await seedUser("boss", "admin");
    await assertFails(updateDoc(doc(as("boss"), `${S}/users/boss`), { role: "member" }));
    await assertFails(updateDoc(doc(as("boss"), `${S}/users/boss`), { status: "disabled" }));
    await assertFails(deleteDoc(doc(as("boss"), `${S}/users/boss`)));
  });
  it("members can't list or manage accounts", async () => {
    await seedUser("ann");
    await seedUser("pat", "member", "pending");
    await assertFails(getDocs(collection(as("ann"), `${S}/users`)));
    await assertFails(getDoc(doc(as("ann"), `${S}/users/pat`)));
    await assertFails(updateDoc(doc(as("ann"), `${S}/users/pat`), { status: "approved" }));
    await assertSucceeds(getDoc(doc(as("ann"), `${S}/users/ann`)));
  });
});

describe("one-time setup (first admin)", () => {
  const setupBatch = (db: Firestore, uid: string, proof: Record<string, string>) => {
    const b = writeBatch(db);
    b.set(doc(db, `${S}/users/${uid}`), profile("Owner", `${uid}@x.com`, "admin", "approved"));
    b.set(doc(db, `${S}/meta/setup`), { done: true, at: now, ...proof });
    return b.commit();
  };

  it("the account that owns old data becomes admin, once", async () => {
    await seed((db) => setDoc(doc(db, "srmVoiceLog/owner/vendors/old1"), vendor));
    await assertSucceeds(getDoc(doc(anon(), `${S}/meta/setup`)));
    await assertSucceeds(setupBatch(as("owner"), "owner", { legacyVendor: "old1" }));
    // …then copies its old data into the shared space.
    await assertSucceeds(getDocs(collection(as("owner"), "srmVoiceLog/owner/vendors")));
    await assertSucceeds(setDoc(doc(as("owner"), `${S}/vendors/old1`), vendor));
    // Never again, not even by the same person.
    await seed((db) => setDoc(doc(db, "srmVoiceLog/other/vendors/x"), vendor));
    await assertFails(setupBatch(as("other"), "other", { legacyVendor: "x" }));
    await assertFails(setDoc(doc(as("owner"), `${S}/meta/setup`), { done: true, at: now + 1, legacyVendor: "old1" }));
  });
  it("an account without old data can't become admin", async () => {
    await assertFails(setupBatch(as("eve"), "eve", { legacyVendor: "nope" }));
    await seed((db) => setDoc(doc(db, "srmVoiceLog/owner/vendors/old1"), vendor));
    await assertFails(setupBatch(as("eve"), "eve", { legacyVendor: "old1" })); // someone else's proof
  });
  it("can't create a profile as admin without the setup marker", async () => {
    await seed((db) => setDoc(doc(db, "srmVoiceLog/owner/vendors/old1"), vendor));
    await assertFails(setDoc(doc(as("owner"), `${S}/users/owner`), profile("Owner", "owner@x.com", "admin", "approved")));
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
  it("approved accounts share recordings; others can't read them", async () => {
    await seedUser("ann");
    await seedUser("bob");
    await seedUser("pat", "member", "pending");
    await assertSucceeds(uploadBytes(ref(env.authenticatedContext("ann").storage(), "srmVoiceLog/shared/audio/c1"), audio, { contentType: "audio/webm" }));
    await assertSucceeds(getBytes(ref(env.authenticatedContext("bob").storage(), "srmVoiceLog/shared/audio/c1")));
    await assertFails(getBytes(ref(env.authenticatedContext("pat").storage(), "srmVoiceLog/shared/audio/c1")));
    await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), "srmVoiceLog/shared/audio/c1")));
  });
  it("only audio", async () => {
    await seedUser("ann");
    await assertFails(uploadBytes(ref(env.authenticatedContext("ann").storage(), "srmVoiceLog/shared/audio/c2"), audio, { contentType: "text/html" }));
  });
});
