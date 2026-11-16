import { UsersPage } from "@/components/users/UsersPage";

// Pages render client-side behind Firebase Auth (see AppShell).
export const instant = false;

export default function Users() {
  return <UsersPage />;
}
