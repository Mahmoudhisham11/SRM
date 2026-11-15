"use client";

import type { Case, CaseInput, CasePatch, Vendor, VendorInput } from "../types";
import { audioStore, LOCAL_AUDIO_PREFIX } from "./audioStore";
import { buildCaseDoc, cleanVendorInput, normalizeVendor, planVendorImport, patchWithStatus, sortCases, sortVendors, type DataRepo } from "./repo";

const KEY = "srm-voice-log:demo:v1";

interface Store {
  vendors: Record<string, Vendor>;
  cases: Record<string, Case>;
}

function newId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 20);
}

/**
 * Demo-mode repository: everything lives in this browser's localStorage.
 * Used automatically when Firebase env vars are missing, so the app can be
 * tried (and tested) without a Firebase project. Audio clips are kept in
 * IndexedDB (localStorage is too small for them); the case stores a
 * "local-audio:<id>" reference that the player resolves.
 */
export class LocalRepo implements DataRepo {
  readonly kind = "local" as const;
  readonly audioEnabled = true;
  readonly ownerId = "demo";
  private listeners = new Set<() => void>();
  private store: Store;

  constructor() {
    this.store = this.load();
    window.addEventListener("storage", (e) => {
      if (e.key === KEY) {
        this.store = this.load();
        this.emit();
      }
    });
  }

  private load(): Store {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw) as Store;
        for (const [id, v] of Object.entries(s.vendors)) s.vendors[id] = normalizeVendor(id, v);
        return s;
      }
    } catch {
      /* private mode / corrupted — start empty */
    }
    return { vendors: {}, cases: {} };
  }

  private commit() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.store));
    } catch (e) {
      throw new Error("Local storage is full (demo mode) — مساحة التخزين المحلي امتلأت. " + String(e));
    }
    this.emit();
  }

  private emit() {
    // async like a real snapshot listener
    queueMicrotask(() => this.listeners.forEach((l) => l()));
  }

  private subscribe(fn: () => void) {
    this.listeners.add(fn);
    queueMicrotask(fn);
    return () => void this.listeners.delete(fn);
  }

  watchVendors(onData: (v: Vendor[]) => void) {
    return this.subscribe(() => onData(sortVendors(Object.values(this.store.vendors))));
  }

  watchCases(vendorId: string | null, onData: (c: Case[]) => void) {
    return this.subscribe(() => {
      const all = Object.values(this.store.cases);
      onData(sortCases(vendorId ? all.filter((c) => c.vendorId === vendorId) : all));
    });
  }

  createVendor(input: VendorInput) {
    const id = newId();
    const now = Date.now();
    this.store.vendors[id] = { id, ...cleanVendorInput(input), createdAt: now, updatedAt: now };
    this.commit();
    return { id, done: Promise.resolve() };
  }

  async updateVendor(id: string, input: VendorInput) {
    const v = this.store.vendors[id];
    if (!v) throw new Error("Vendor not found — المورد غير موجود");
    this.store.vendors[id] = { ...v, ...cleanVendorInput(input), updatedAt: Date.now() };
    this.commit();
  }

  async importVendors(rows: VendorInput[], existing: Vendor[]) {
    const plan = planVendorImport(rows, existing);
    const now = Date.now();
    for (const v of plan.create) {
      const id = newId();
      this.store.vendors[id] = { id, ...v, createdAt: now, updatedAt: now };
    }
    for (const { id, input } of plan.update) {
      const v = this.store.vendors[id];
      if (v) this.store.vendors[id] = { ...v, ...input, updatedAt: now };
    }
    this.commit();
    return { created: plan.create.length, updated: plan.update.length, unchanged: plan.unchanged };
  }

  async deleteVendor(id: string) {
    delete this.store.vendors[id];
    for (const c of Object.values(this.store.cases)) {
      if (c.vendorId !== id) continue;
      delete this.store.cases[c.id];
      void audioStore.delete("clips", c.id).catch(() => undefined);
    }
    this.commit();
  }

  newCaseId() {
    return newId();
  }

  async createCase(id: string, input: CaseInput) {
    this.store.cases[id] = buildCaseDoc(id, input, Date.now());
    this.commit();
  }

  async updateCase(id: string, patch: CasePatch) {
    const c = this.store.cases[id];
    if (!c) throw new Error("Case not found — الحالة غير موجودة");
    this.store.cases[id] = { ...c, ...patchWithStatus(patch, Date.now()) } as Case;
    this.commit();
  }

  async deleteCase(id: string) {
    delete this.store.cases[id];
    this.commit();
    void audioStore.delete("clips", id).catch(() => undefined);
  }

  async uploadAudio(caseId: string, blob: Blob) {
    await audioStore.put("clips", caseId, blob);
    const url = `${LOCAL_AUDIO_PREFIX}${caseId}`;
    await this.updateCase(caseId, { audioUrl: url });
    return url;
  }

  /** Replace everything (used by "load sample data"). */
  replaceAll(vendors: Vendor[], cases: Case[]) {
    this.store = {
      vendors: Object.fromEntries(vendors.map((v) => [v.id, v])),
      cases: Object.fromEntries(cases.map((c) => [c.id, c])),
    };
    this.commit();
  }
}
