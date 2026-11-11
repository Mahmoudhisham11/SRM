"use client";

import type { Case, CaseInput, CasePatch, Vendor, VendorInput } from "../types";
import { buildCaseDoc, cleanVendorInput, patchWithStatus, sortCases, sortVendors, type DataRepo } from "./repo";

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
 * tried (and tested) without a Firebase project. Audio is kept as a data URL.
 */
export class LocalRepo implements DataRepo {
  readonly kind = "local" as const;
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
      if (raw) return JSON.parse(raw) as Store;
    } catch {
      /* private mode / corrupted — start empty */
    }
    return { vendors: {}, cases: {} };
  }

  private commit() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.store));
    } catch (e) {
      throw new Error("مساحة التخزين المحلي امتلأت (وضع تجريبي). " + String(e));
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
    if (!v) throw new Error("المورد غير موجود");
    this.store.vendors[id] = { ...v, ...cleanVendorInput(input), updatedAt: Date.now() };
    this.commit();
  }

  async deleteVendor(id: string) {
    delete this.store.vendors[id];
    for (const c of Object.values(this.store.cases)) if (c.vendorId === id) delete this.store.cases[c.id];
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
    if (!c) throw new Error("الحالة غير موجودة");
    this.store.cases[id] = { ...c, ...patchWithStatus(patch, Date.now()) } as Case;
    this.commit();
  }

  async deleteCase(id: string) {
    delete this.store.cases[id];
    this.commit();
  }

  async uploadAudio(caseId: string, blob: Blob) {
    const url = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
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
