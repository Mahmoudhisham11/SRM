import { DuesPage } from "@/components/dues/DuesPage";

// Pages render client-side behind Firebase Auth (see AppShell).
export const instant = false;

export default function Dues() {
  return <DuesPage />;
}
