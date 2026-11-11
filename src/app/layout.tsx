import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import { DataProvider } from "@/components/providers/DataProvider";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

const cairo = Cairo({ subsets: ["arabic", "latin"], variable: "--font-cairo", display: "swap" });

export const metadata: Metadata = {
  title: "SRM Voice Log",
  description: "تسجيل حالات الموردين اليومية بالصوت",
  applicationName: "SRM Voice Log",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f766e",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} h-full antialiased`}>
      <body className="min-h-full bg-slate-50 text-slate-900">
        <ToastProvider>
          <DataProvider>
            <AppShell>{children}</AppShell>
          </DataProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
