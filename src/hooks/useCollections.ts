"use client";

import { useEffect, useMemo, useState } from "react";
import { useRepo } from "@/components/providers/DataProvider";
import type { Case, Vendor } from "@/lib/types";

export interface Live<T> {
  data: T;
  loading: boolean;
  error: Error | null;
}

export function useVendors(): Live<Vendor[]> {
  const repo = useRepo();
  const [state, setState] = useState<Live<Vendor[]>>({ data: [], loading: true, error: null });
  useEffect(
    () =>
      repo.watchVendors(
        (data) => setState({ data, loading: false, error: null }),
        (error) => setState((s) => ({ ...s, loading: false, error })),
      ),
    [repo],
  );
  return state;
}

/** Live cases; pass a vendorId to scope to one vendor, or null for all. */
export function useCases(vendorId: string | null): Live<Case[]> {
  const repo = useRepo();
  const [state, setState] = useState<Live<Case[]> & { key: string | null }>({
    data: [], loading: true, error: null, key: vendorId,
  });
  useEffect(
    () =>
      repo.watchCases(
        vendorId,
        (data) => setState({ data, loading: false, error: null, key: vendorId }),
        (error) => setState((s) => ({ ...s, loading: false, error, key: vendorId })),
      ),
    [repo, vendorId],
  );
  // Don't show the previous vendor's cases while the new subscription loads.
  return state.key === vendorId ? state : { data: [], loading: true, error: null };
}

export function useVendorMap(vendors: Vendor[]): Map<string, Vendor> {
  return useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors]);
}
