/**
 * How the Analysis lists are stored (Firestore doc
 * srmVoiceLog/shared/settings/duesAnalysis, and a copy in localStorage).
 *
 * Firestore rejects arrays inside arrays, so the per-invoice decisions are
 * stored as a list of {key, place} objects (invoice keys can contain «/», «.»
 * and other characters field names dislike, so they aren't map keys either).
 */
import type { AnalysisConfig, Placement } from "./analysis";

const PLACES: readonly Placement[] = ["Filtered", "Applied", "Fixed", "Masader", "none"];

export interface StoredConfig extends Omit<AnalysisConfig, "exceptions"> {
  exceptionList: Array<{ key: string; place: Placement }>;
}

export function toStored(c: AnalysisConfig): StoredConfig {
  const { exceptions, ...rest } = c;
  const out: StoredConfig = {
    version: 1,
    fixedVendors: [...rest.fixedVendors],
    excludedVendors: [...rest.excludedVendors],
    masaderVendors: [...rest.masaderVendors],
    vendorNames: { ...rest.vendorNames },
    exceptionList: Object.entries(exceptions).map(([key, place]) => ({ key, place })),
  };
  // Firestore rejects `undefined`: only keep the optional fields that are set.
  if (rest.learnedFrom) out.learnedFrom = rest.learnedFrom;
  if (rest.learnedAt) out.learnedAt = rest.learnedAt;
  return out;
}

/** Reads the stored form, including the older [key, place] pairs kept on devices. */
export function fromStored(s: unknown): AnalysisConfig | null {
  const v = s as Partial<StoredConfig> & { exceptionList?: unknown[] };
  if (!v || !Array.isArray(v.fixedVendors)) return null;
  const exceptions: Record<string, Placement> = {};
  for (const item of v.exceptionList ?? []) {
    const [key, place] = Array.isArray(item) ? item : [(item as { key?: unknown })?.key, (item as { place?: unknown })?.place];
    if (typeof key === "string" && PLACES.includes(place as Placement)) exceptions[key] = place as Placement;
  }
  return {
    version: 1,
    fixedVendors: v.fixedVendors ?? [],
    excludedVendors: v.excludedVendors ?? [],
    masaderVendors: v.masaderVendors ?? [],
    exceptions,
    vendorNames: v.vendorNames ?? {},
    learnedFrom: v.learnedFrom,
    learnedAt: v.learnedAt,
  };
}
