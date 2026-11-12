"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { DataProvider } from "./DataProvider";
import { ToastProvider } from "./ToastProvider";
import { useDocumentPrefs } from "@/lib/i18n/useI18n";

function DocumentPrefs() {
  useDocumentPrefs();
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    // reducedMotion="user": transforms are dropped when the OS asks for less motion.
    <MotionConfig reducedMotion="user" transition={{ type: "spring", stiffness: 420, damping: 34 }}>
      <DocumentPrefs />
      <ToastProvider>
        <DataProvider>{children}</DataProvider>
      </ToastProvider>
    </MotionConfig>
  );
}
