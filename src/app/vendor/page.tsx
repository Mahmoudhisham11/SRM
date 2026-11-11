import { VendorPageClient } from "@/components/vendors/VendorPageClient";

// Pages render client-side behind Firebase Auth (see AppShell), so there is no
// server-rendered content for Next to validate for instant navigation.
export const instant = false;

export default function VendorPage() {
  return <VendorPageClient />;
}
