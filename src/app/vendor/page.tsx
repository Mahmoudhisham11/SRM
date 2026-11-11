"use client";

import { Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { VendorDetail } from "@/components/vendors/VendorDetail";
import { VoiceLogger } from "@/components/voice/VoiceLogger";
import { FieldMic } from "@/components/voice/FieldMic";
import { LoadingBlock } from "@/components/ui";
import { useDefaultYear } from "@/hooks/useVoicePrefs";
import { parseSpokenDate } from "@/lib/parsing/arabicDates";

function VendorFromQuery() {
  const id = useSearchParams().get("id") ?? "";
  const [year] = useDefaultYear();
  const parseDate = useCallback((t: string) => parseSpokenDate(t, { defaultYear: year }), [year]);
  return (
    <VendorDetail
      id={id}
      // key: a fresh logger (empty session) per vendor
      logger={(vendor) => <VoiceLogger key={vendor.id} vendor={vendor} />}
      fieldMic={(field, apply) => <FieldMic field={field} onText={apply} />}
      parseDate={parseDate}
    />
  );
}

export default function VendorPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <VendorFromQuery />
    </Suspense>
  );
}
