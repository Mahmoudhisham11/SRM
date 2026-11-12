import { Suspense } from "react";
import { HomePage } from "@/components/home/HomePage";

// Pages render client-side behind Firebase Auth (see AppShell), so there is no
// server-rendered content for Next to validate for instant navigation.
export const instant = false;

export default function Home() {
  return (
    <Suspense>
      <HomePage />
    </Suspense>
  );
}
