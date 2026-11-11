"use client";

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes, type FirebaseStorage } from "firebase/storage";
import type { Case, CaseInput, CasePatch, Vendor, VendorInput } from "../types";
import { buildCaseDoc, cleanVendorInput, patchWithStatus, sortCases, sortVendors, type DataRepo } from "./repo";

/**
 * Layout (all per-user, enforced by firestore.rules):
 *   users/{uid}/vendors/{vendorId}
 *   users/{uid}/cases/{caseId}        (flat, with vendorId — reports read all)
 *   storage: users/{uid}/audio/{caseId}
 */
export class FirestoreRepo implements DataRepo {
  readonly kind = "firestore" as const;

  constructor(
    private db: Firestore,
    private storage: FirebaseStorage,
    private uid: string,
  ) {}

  private vendorsCol() {
    return collection(this.db, "users", this.uid, "vendors");
  }
  private casesCol() {
    return collection(this.db, "users", this.uid, "cases");
  }
  private audioRef(caseId: string) {
    return ref(this.storage, `users/${this.uid}/audio/${caseId}`);
  }

  watchVendors(onData: (v: Vendor[]) => void, onError: (e: Error) => void) {
    return onSnapshot(
      this.vendorsCol(),
      (snap) => onData(sortVendors(snap.docs.map((d) => ({ ...(d.data() as Omit<Vendor, "id">), id: d.id })))),
      onError,
    );
  }

  watchCases(vendorId: string | null, onData: (c: Case[]) => void, onError: (e: Error) => void) {
    const q = vendorId ? query(this.casesCol(), where("vendorId", "==", vendorId)) : this.casesCol();
    return onSnapshot(
      q,
      (snap) => onData(sortCases(snap.docs.map((d) => ({ ...(d.data() as Omit<Case, "id">), id: d.id })))),
      onError,
    );
  }

  createVendor(input: VendorInput) {
    const ref = doc(this.vendorsCol());
    const now = Date.now();
    const done = setDoc(ref, { ...cleanVendorInput(input), createdAt: now, updatedAt: now });
    return { id: ref.id, done };
  }

  updateVendor(id: string, input: VendorInput) {
    return updateDoc(doc(this.vendorsCol(), id), { ...cleanVendorInput(input), updatedAt: Date.now() });
  }

  async deleteVendor(id: string) {
    const cases = await getDocs(query(this.casesCol(), where("vendorId", "==", id)));
    // Batches are limited to 500 writes.
    const refs = [...cases.docs.map((d) => d.ref), doc(this.vendorsCol(), id)];
    for (let i = 0; i < refs.length; i += 450) {
      const batch = writeBatch(this.db);
      refs.slice(i, i + 450).forEach((r) => batch.delete(r));
      await batch.commit();
    }
    await Promise.allSettled(cases.docs.filter((d) => d.get("audioUrl")).map((d) => deleteObject(this.audioRef(d.id))));
  }

  newCaseId() {
    return doc(this.casesCol()).id;
  }

  createCase(id: string, input: CaseInput) {
    const { id: _omit, ...data } = buildCaseDoc(id, input, Date.now());
    void _omit;
    return setDoc(doc(this.casesCol(), id), data);
  }

  updateCase(id: string, patch: CasePatch) {
    return updateDoc(doc(this.casesCol(), id), patchWithStatus(patch, Date.now()));
  }

  async deleteCase(id: string) {
    await deleteDoc(doc(this.casesCol(), id));
    await deleteObject(this.audioRef(id)).catch(() => undefined); // may not exist
  }

  async uploadAudio(caseId: string, blob: Blob) {
    const r = this.audioRef(caseId);
    await uploadBytes(r, blob, { contentType: blob.type || "audio/webm" });
    const url = await getDownloadURL(r);
    await this.updateCase(caseId, { audioUrl: url });
    return url;
  }
}
