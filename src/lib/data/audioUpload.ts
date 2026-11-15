"use client";

import { audioStore } from "./audioStore";
import type { DataRepo } from "./repo";

/**
 * Uploads a case's recording without losing it when the connection drops:
 * offline (or a network failure) → the clip is kept in IndexedDB and uploaded
 * by `flushPendingAudio` once the connection is back (or on the next visit).
 */
export type UploadResult = { status: "uploaded" } | { status: "queued" } | { status: "failed"; code: string };

const NETWORK_ERROR = /retry-limit-exceeded|network|unavailable|canceled|storage\/unknown/i;

const errCode = (e: unknown) => String((e as { code?: string })?.code ?? (e as Error)?.message ?? "");
const pendingKey = (repo: DataRepo, caseId: string) => `${repo.ownerId}/${caseId}`;

async function queue(repo: DataRepo, caseId: string, blob: Blob): Promise<UploadResult> {
  try {
    await audioStore.put("pending", pendingKey(repo, caseId), blob);
    return { status: "queued" };
  } catch (e) {
    return { status: "failed", code: errCode(e) };
  }
}

export async function uploadAudioReliably(repo: DataRepo, caseId: string, blob: Blob): Promise<UploadResult> {
  if (repo.kind === "firestore" && typeof navigator !== "undefined" && navigator.onLine === false) return queue(repo, caseId, blob);
  try {
    await repo.uploadAudio(caseId, blob);
    return { status: "uploaded" };
  } catch (e) {
    const code = errCode(e);
    if (repo.kind === "firestore" && (NETWORK_ERROR.test(code) || navigator.onLine === false)) return queue(repo, caseId, blob);
    return { status: "failed", code };
  }
}

let flushing = false;

/** Upload every queued recording of this repo's user. Returns how many were uploaded. */
export async function flushPendingAudio(repo: DataRepo): Promise<number> {
  if (flushing || !repo.audioEnabled || (typeof navigator !== "undefined" && navigator.onLine === false)) return 0;
  flushing = true;
  let done = 0;
  try {
    const prefix = `${repo.ownerId}/`;
    const keys = (await audioStore.keys("pending")).filter((k) => k.startsWith(prefix));
    for (const key of keys) {
      const blob = await audioStore.get("pending", key);
      const caseId = key.slice(prefix.length);
      if (!blob) {
        await audioStore.delete("pending", key);
        continue;
      }
      try {
        await repo.uploadAudio(caseId, blob);
        await audioStore.delete("pending", key);
        done++;
      } catch (e) {
        // Still offline → try again later. Anything else (case deleted, no permission) → drop it.
        if (NETWORK_ERROR.test(errCode(e))) break;
        await audioStore.delete("pending", key);
      }
    }
  } catch {
    /* IndexedDB unavailable */
  } finally {
    flushing = false;
  }
  return done;
}
