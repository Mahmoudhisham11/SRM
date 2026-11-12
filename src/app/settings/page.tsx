import { SettingsPage } from "@/components/settings/SettingsPage";

// Pages render client-side behind Firebase Auth (see AppShell), so there is no
// server-rendered content for Next to validate for instant navigation.
export const instant = false;

export default function Settings() {
  return <SettingsPage />;
}
