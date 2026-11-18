"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { ChartColumn, ChevronLeft, ChevronRight, ClipboardList, HandCoins, LogOut, Mic, Search, Settings, Store, WifiOff } from "lucide-react";
import { useData } from "./providers/DataProvider";
import { AuthScreen } from "./auth/AuthScreens";
import { BrandLogo, LangToggle, Logo, Monogram, Sheet } from "./ui";
import { useI18n } from "@/lib/i18n/useI18n";
import { useGreetingName, useOnline, pressMic } from "@/hooks/useAppChrome";
import { useVendors } from "@/hooks/useCollections";
import { normalizeArabic } from "@/lib/parsing/normalize";
import type { MessageKey } from "@/lib/i18n/messages";

export function AppShell({ children }: { children: ReactNode }) {
  const { auth } = useData();
  if (auth.status === "loading") return <Splash />;
  if (auth.status === "signedOut") return <AuthScreen />;
  return <SignedInShell>{children}</SignedInShell>;
}

function Splash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6" role="status" aria-label="Loading">
      <BrandLogo className="h-16" />
      <motion.span
        className="h-1 w-24 overflow-hidden rounded-full bg-berry-tint"
        aria-hidden
      >
        <motion.span
          className="block h-full w-1/3 rounded-full bg-berry"
          animate={{ x: ["-100%", "300%"] }}
          transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
        />
      </motion.span>
    </div>
  );
}

function SignedInShell({ children }: { children: ReactNode }) {
  const [picking, setPicking] = useState(false);
  const pathname = usePathname();
  const onMic = () => {
    if (!pressMic()) setPicking(true);
  };
  return (
    <div className="min-h-dvh lg:flex">
      <Sidebar onLog={onMic} />
      <div className="min-w-0 flex-1 lg:ps-72">
        <StatusBanners />
        <main className="mx-auto w-full max-w-6xl px-4 pb-36 pt-2 sm:px-6 lg:px-10 lg:pb-12 lg:pt-8 print:max-w-none print:p-0">
          {children}
        </main>
      </div>
      {!pathname.startsWith("/reports/manager") && <BottomNav onMic={onMic} />}
      <VendorPicker open={picking} onClose={() => setPicking(false)} />
    </div>
  );
}

function StatusBanners() {
  const { demo } = useData();
  const online = useOnline();
  const { t } = useI18n();
  if (online && !demo) return null;
  return (
    <div className="flex flex-col items-center gap-1 px-4 pt-3 print:hidden">
      {!online && (
        <p role="status" className="flex items-center gap-2 rounded-full bg-open-bg px-3 py-1.5 text-xs font-semibold text-open">
          <WifiOff className="h-3.5 w-3.5" aria-hidden />
          {t("offline.banner")}
        </p>
      )}
      {demo && <p className="rounded-full bg-surface-2 px-3 py-1 text-xs text-ink-3">{t("demo.banner")}</p>}
    </div>
  );
}

/** Page top bar on phones/tablets: logo (or back + title) and quick controls. */
export function TopBar({
  back,
  title,
  actions,
}: {
  back?: string;
  title?: ReactNode;
  actions?: ReactNode;
}) {
  const { t, isAr } = useI18n();
  const name = useGreetingName();
  const BackIcon = isAr ? ChevronRight : ChevronLeft;
  return (
    <header className="flex items-center gap-3 py-3 lg:hidden print:hidden">
      {back ? (
        <Link
          href={back}
          aria-label={t("nav.back")}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-2 shadow-[var(--shadow-soft)]"
        >
          <BackIcon className="h-5 w-5" />
        </Link>
      ) : (
        <Link href="/" aria-label={t("nav.vendors")}>
          <Logo />
        </Link>
      )}
      <div className="min-w-0 flex-1 truncate text-center text-lg font-bold">{title}</div>
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        <LangToggle />
        {!back && (
          <Link
            href="/settings"
            aria-label={t("nav.settings")}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-pink font-bold text-berry"
          >
            {name ? name[0] : <Settings className="h-5 w-5" />}
          </Link>
        )}
      </div>
    </header>
  );
}

/** Desktop: page heading row with an optional back link (the sidebar holds navigation). */
export function DesktopHeader({ back, title, actions }: { back?: string; title?: ReactNode; actions?: ReactNode }) {
  const { t, isAr } = useI18n();
  const BackIcon = isAr ? ChevronRight : ChevronLeft;
  return (
    <div className="mb-6 hidden items-center gap-4 lg:flex print:hidden">
      {back && (
        <Link href={back} className="flex items-center gap-1 text-sm font-semibold text-ink-3 hover:text-berry">
          <BackIcon className="h-4 w-4" />
          {t("nav.vendors")}
        </Link>
      )}
      {title && <h1 className="font-display-en text-3xl font-bold">{title}</h1>}
      <div className="ms-auto flex items-center gap-2">{actions}</div>
    </div>
  );
}

const NAV: Array<{ href: string; labelKey: MessageKey; icon: typeof Store; match: (p: string) => boolean }> = [
  { href: "/", labelKey: "nav.vendors", icon: Store, match: (p) => p === "/" || p.startsWith("/vendor") },
  { href: "/dues", labelKey: "nav.dues", icon: HandCoins, match: (p) => p.startsWith("/dues") },
  { href: "/reports", labelKey: "nav.reports", icon: ChartColumn, match: (p) => p === "/reports" },
  { href: "/reports/manager", labelKey: "nav.manager", icon: ClipboardList, match: (p) => p.startsWith("/reports/manager") },
  { href: "/settings", labelKey: "nav.settings", icon: Settings, match: (p) => p.startsWith("/settings") },
];

function Sidebar({ onLog }: { onLog: () => void }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const { auth, demo, signOut } = useData();
  const name = useGreetingName();
  const user = auth.status === "signedIn" ? auth.user : null;
  return (
    <aside className="fixed inset-y-0 start-0 z-30 hidden w-72 flex-col border-e border-line bg-surface/80 px-5 py-7 backdrop-blur lg:flex print:hidden">
      <Link href="/" className="px-3">
        <Logo full />
      </Link>
      <nav className="mt-10 flex flex-col gap-1">
        {NAV.slice(0, 1).map((n) => (
          <NavItem key={n.href} href={n.href} icon={n.icon} active={n.match(pathname)} label={t(n.labelKey)} />
        ))}
        <button
          type="button"
          onClick={onLog}
          className="flex h-12 items-center gap-3 rounded-2xl px-4 text-start font-medium text-ink-2 transition hover:bg-surface-2"
        >
          <Mic className="h-5 w-5" aria-hidden />
          {t("nav.log")}
        </button>
        {NAV.slice(1).map((n) => (
          <NavItem key={n.href} href={n.href} icon={n.icon} active={n.match(pathname)} label={t(n.labelKey)} />
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-4">
        <div className="self-start">
          <LangToggle />
        </div>
        {user && (
          <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
            <Monogram name={name || "S"} className="h-10 w-10 rounded-full text-base" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{name || "SRM"}</p>
              <p className="truncate text-xs text-ink-3">{demo ? t("demo.banner").split("—")[0] : user.name}</p>
            </div>
            {!demo && (
              <button type="button" onClick={() => signOut()} aria-label={t("settings.signOut")} className="rounded-full p-2 text-ink-3 hover:text-berry">
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function NavItem({ href, icon: Icon, label, active }: { href: string; icon: typeof Store; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative flex h-12 items-center gap-3 rounded-2xl px-4 font-medium transition ${active ? "text-berry" : "text-ink-2 hover:bg-surface-2"}`}
    >
      {active && <motion.span layoutId="side-active" className="absolute inset-0 rounded-2xl bg-surface-pink" />}
      <Icon className="relative h-5 w-5" aria-hidden />
      <span className="relative">{label}</span>
    </Link>
  );
}

function BottomNav({ onMic }: { onMic: () => void }) {
  const pathname = usePathname();
  const { t } = useI18n();
  // Vendors · Dues | mic | Reports · Settings
  const items = [NAV[0], NAV[1], NAV[2], NAV[NAV.length - 1]];
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto max-w-md lg:hidden print:hidden"
    >
      <div className="relative flex h-[4.5rem] items-center justify-between rounded-[2rem] border border-line bg-surface/95 px-3 shadow-[var(--shadow-lift)] backdrop-blur">
        {items.map((n, i) => {
          const active = n.match(pathname);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={`flex w-16 flex-col items-center gap-1 text-[11px] font-semibold ${active ? "text-berry" : "text-ink-3"} ${i >= 2 ? "order-3" : ""}`}
            >
              <n.icon className="h-5 w-5" aria-hidden />
              {t(n.labelKey)}
            </Link>
          );
        })}
        <motion.button
          type="button"
          onClick={onMic}
          whileTap={{ scale: 0.92 }}
          aria-label={t("nav.log")}
          className="order-2 -mt-10 flex h-16 w-16 items-center justify-center rounded-full border-4 border-bg bg-gradient-to-b from-[var(--mic-1)] to-[var(--mic-2)] text-on-berry shadow-[var(--shadow-mic)]"
        >
          <Mic className="h-7 w-7" />
        </motion.button>
      </div>
    </nav>
  );
}

/** Sheet to choose a vendor before logging (from the center mic / sidebar). */
/** Rows shown in the picker; search narrows the rest. */
const PICKER_LIMIT = 50;

function VendorPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, vendorName, vendorAltName } = useI18n();
  const router = useRouter();
  const vendors = useVendors();
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const nq = normalizeArabic(q.trim());
    const parts = nq.split(/\s+/).filter(Boolean);
    const all = vendors.data.filter((v) => {
      const hay = normalizeArabic(`${v.nameAr} ${v.nameEn} ${v.code} ${v.material}`);
      return parts.every((p) => hay.includes(p));
    });
    return all;
  }, [vendors.data, q]);
  return (
    <Sheet open={open} title={t("vendors.pick")} onClose={onClose}>
      <label className="relative mb-3 block">
        <Search className="pointer-events-none absolute inset-y-0 start-4 my-auto h-5 w-5 text-ink-3" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("vendors.search")}
          aria-label={t("vendors.search")}
          className="h-12 w-full rounded-full border border-line-strong bg-surface ps-12 pe-4 focus:outline-none focus:ring-4 focus:ring-berry-tint"
        />
      </label>
      <ul className="flex flex-col gap-2">
        {list.slice(0, PICKER_LIMIT).map((v) => (
          <li key={v.id}>
            <button
              type="button"
              onClick={() => {
                onClose();
                setQ("");
                router.push(`/vendor?id=${encodeURIComponent(v.id)}&log=1`);
              }}
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-start hover:border-berry-soft"
            >
              <Monogram name={vendorName(v)} className="h-10 w-10 text-base" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{vendorName(v)}</span>
                {(vendorAltName(v) || v.material) && (
                  <span className="block truncate text-xs text-ink-3">{[v.material, vendorAltName(v)].filter(Boolean).join(" · ")}</span>
                )}
              </span>
              {v.code && <span className="ltr-nums rounded-lg bg-surface-2 px-2 py-1 text-xs font-semibold text-ink-2">{v.code}</span>}
            </button>
          </li>
        ))}
        {list.length > PICKER_LIMIT && (
          <li className="py-2 text-center text-xs text-ink-3">{t("vendors.pickMore", { n: list.length - PICKER_LIMIT })}</li>
        )}
        {!vendors.loading && vendors.data.length === 0 && (
          <li className="py-6 text-center text-sm text-ink-3">
            {t("vendors.empty.title")} —{" "}
            <Link href="/?add=1" onClick={onClose} className="font-semibold text-berry underline">
              {t("vendors.add")}
            </Link>
          </li>
        )}
      </ul>
    </Sheet>
  );
}

