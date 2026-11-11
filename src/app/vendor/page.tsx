"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { VendorDetail } from "@/components/vendors/VendorDetail";
import { LoadingBlock } from "@/components/ui";

function VendorFromQuery() {
  const id = useSearchParams().get("id") ?? "";
  return <VendorDetail id={id} />;
}

export default function VendorPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <VendorFromQuery />
    </Suspense>
  );
}
