"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useData } from "./providers/DataProvider";
import { errorMessage, useToast } from "./providers/ToastProvider";
import { Button, Icon, LoadingBlock, type IconName } from "./ui";

const NAV: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/", label: "الموردين", icon: "users" },
  { href: "/reports", label: "التقارير", icon: "chart" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/vendor");
  return pathname.startsWith(href);
}

export function AppShell({ children }: { children: ReactNode }) {
  const { auth, demo, signOut } = useData();
  const pathname = usePathname();

  if (auth.status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <LoadingBlock />
      </div>
    );
  }
  if (auth.status === "signedOut") return <SignIn />;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur print:hidden">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-slate-900" dir="ltr">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-700 text-white">
              <Icon name="mic" className="h-4 w-4" />
            </span>
            <span className="hidden sm:inline">SRM Voice Log</span>
          </Link>
          <nav className="flex flex-1 items-center gap-1">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold ${
                  isActive(pathname, n.href) ? "bg-teal-50 text-teal-800" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Icon name={n.icon} className="h-4 w-4" />
                {n.label}
              </Link>
            ))}
          </nav>
          {!demo && (
            <div className="flex items-center gap-2">
              {auth.user.photoURL && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={auth.user.photoURL} alt="" className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" />
              )}
              <button
                type="button"
                onClick={() => signOut()}
                title={`تسجيل الخروج (${auth.user.email})`}
                aria-label="تسجيل الخروج"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <Icon name="logout" className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        {demo && (
          <div className="bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-900">
            وضع تجريبي: البيانات محفوظة في هذا المتصفح فقط. أضف إعدادات Firebase (راجع README) للمزامنة بين الموبايل واللابتوب.
          </div>
        )}
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 print:max-w-none print:p-0">{children}</main>
    </div>
  );
}

function SignIn() {
  const { signIn } = useData();
  const { notify } = useToast();
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-teal-50 to-white px-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-xl ring-1 ring-slate-200">
        <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-700 text-white">
          <Icon name="mic" className="h-8 w-8" />
        </span>
        <h1 className="text-2xl font-bold text-slate-900" dir="ltr">
          SRM Voice Log
        </h1>
        <p className="mt-2 text-slate-600">سجّل شغل الموردين اليومي بصوتك</p>
        <Button size="lg" className="mt-8 w-full" onClick={() => signIn().catch((e) => notify(errorMessage(e), "error"))}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
            <path fill="#fff" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.8 3-4.4 3-7.3Z" />
            <path fill="#fff" opacity=".85" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z" />
            <path fill="#fff" opacity=".7" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14Z" />
            <path fill="#fff" opacity=".55" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 6 12 6Z" />
          </svg>
          الدخول بحساب Google
        </Button>
      </div>
    </div>
  );
}
