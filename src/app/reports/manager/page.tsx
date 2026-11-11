import { ManagerReport } from "@/components/reports/ManagerReport";

// Pages render client-side behind Firebase Auth (see AppShell), so there is no
// server-rendered content for Next to validate for instant navigation.
export const instant = false;

export default function Manager() {
  return <ManagerReport />;
}
