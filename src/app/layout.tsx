import type { Metadata, Viewport } from "next";
import { Fraunces, Readex_Pro } from "next/font/google";
import { Providers } from "@/components/providers/Providers";
import { AppShell } from "@/components/AppShell";
import { PRE_PAINT_SCRIPT } from "@/lib/i18n/useI18n";
import "./globals.css";

// One family for Arabic + Latin UI text; a soft serif for English display headings.
const readex = Readex_Pro({ subsets: ["arabic", "latin"], variable: "--font-readex", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap", axes: ["SOFT", "opsz"] });

export const metadata: Metadata = {
  title: "SRM Voice Log",
  description: "Log supplier-relationship work by voice — Arabic & English",
  applicationName: "SRM Voice Log",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SRM Voice",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#962b5b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // lang/dir/theme are set before paint from the saved preferences.
    <html lang="ar" dir="rtl" className={`${readex.variable} ${fraunces.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PRE_PAINT_SCRIPT }} />
      </head>
      <body className="min-h-full text-ink">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
