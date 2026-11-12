"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VendorDetail } from "./VendorDetail";
import { LoadingBlock } from "@/components/ui";

function VendorFromQuery() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("id") ?? "";
  // "&log=1" (from the center mic) starts logging once; drop it so a refresh doesn't.
  const [autoStart] = useState(params.get("log") === "1");
  useEffect(() => {
    if (params.get("log") === "1") router.replace(`/vendor?id=${encodeURIComponent(id)}`);
  }, [params, router, id]);
  // key: a fresh page (and empty logging session) per vendor
  return <VendorDetail key={id} id={id} autoStart={autoStart} />;
}

export function VendorPageClient() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <VendorFromQuery />
    </Suspense>
  );
}
