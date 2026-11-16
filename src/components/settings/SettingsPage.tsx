"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DatabaseBackup, Download, LogOut, Smartphone } from "lucide-react";
import { useToast } from "@/components/providers/ToastProvider";
import { getFirebase } from "@/lib/firebase";
import { renameSelf } from "@/lib/auth/users";
import { TopBar, DesktopHeader } from "@/components/AppShell";
import { useData } from "@/components/providers/DataProvider";
import { Button, Segmented } from "@/components/ui";
import { useI18n } from "@/lib/i18n/useI18n";
import { useDictationLang, useDisplayName, useGender, useLang, useThemePref, type DictationLang, type ThemePref } from "@/hooks/useVoicePrefs";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import type { Gender, Lang } from "@/lib/i18n/messages";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-line py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="font-semibold">{label}</span>
      <div className="sm:min-w-72">{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const { t } = useI18n();
  const { auth, demo, signOut } = useData();
  const [name, setName] = useDisplayName();
  const [lang, setLang] = useLang();
  const [theme, setTheme] = useThemePref();
  const [gender, setGender] = useGender();
  const [dictation, setDictation] = useDictationLang();
  const { canInstall, isInstalled, triggerInstall } = usePwaInstall();
  const user = auth.status === "signedIn" ? auth.user : null;
  const profile = auth.status === "signedIn" ? auth.profile : null;
  const { track, notify, errorText } = useToast();
  // Signed in: the name lives on your account (others see it on the cases you log).
  const [accountName, setAccountName] = useState(profile?.name ?? "");
  const [legacy, setLegacy] = useState<{ vendors: number; cases: number } | null>(null);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    if (demo || profile?.role !== "admin" || !user) return;
    let alive = true;
    import("@/lib/auth/setup").then(({ legacyCounts }) =>
      legacyCounts(getFirebase().db, user.uid).then((c) => alive && setLegacy(c.vendors + c.cases > 0 ? c : null)),
    );
    return () => {
      alive = false;
    };
  }, [demo, profile?.role, user]);

  function saveAccountName() {
    const next = accountName.trim();
    if (!user || !next || next === profile?.name) return;
    track(renameSelf(getFirebase().db, user.uid, next), t("settings.nameSaved"));
    setName(""); // drop any older on-device override
  }

  async function copyAgain() {
    if (!user) return;
    setCopying(true);
    try {
      const { copyLegacyData } = await import("@/lib/auth/setup");
      const r = await copyLegacyData(getFirebase().db, user.uid);
      notify(t("settings.legacyCopied", { vendors: r.vendors, cases: r.cases }), "success");
    } catch (e) {
      notify(errorText(e), "error");
    } finally {
      setCopying(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <TopBar back="/" title={t("settings.title")} />
      <DesktopHeader title={t("settings.title")} />
      <section className="card px-5 sm:px-6">
        <Row label={t("settings.name")}>
          {demo ? (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label={t("settings.name")}
              className="h-11 w-full rounded-full border border-line-strong bg-surface px-4 focus:outline-none focus:ring-4 focus:ring-berry-tint"
            />
          ) : (
            <input
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              onBlur={saveAccountName}
              onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
              aria-label={t("settings.name")}
              className="h-11 w-full rounded-full border border-line-strong bg-surface px-4 focus:outline-none focus:ring-4 focus:ring-berry-tint"
            />
          )}
        </Row>
        <Row label={t("settings.language")}>
          <Segmented<Lang>
            label={t("settings.language")}
            value={lang}
            onChange={setLang}
            options={[
              { value: "ar", label: "العربية" },
              { value: "en", label: "English" },
            ]}
          />
        </Row>
        <Row label={t("settings.theme")}>
          <Segmented<ThemePref>
            label={t("settings.theme")}
            value={theme}
            onChange={setTheme}
            options={[
              { value: "light", label: t("settings.theme.light") },
              { value: "evening", label: t("settings.theme.evening") },
              { value: "system", label: t("settings.theme.system") },
            ]}
          />
        </Row>
        <Row label={t("settings.address")}>
          <Segmented<Gender>
            label={t("settings.address")}
            value={gender}
            onChange={setGender}
            options={[
              { value: "f", label: t("settings.address.f") },
              { value: "m", label: t("settings.address.m") },
            ]}
          />
        </Row>
        <Row label={t("settings.dictation")}>
          <Segmented<DictationLang>
            label={t("settings.dictation")}
            value={dictation}
            onChange={setDictation}
            options={[
              { value: "ar-EG", label: t("settings.dictation.ar") },
              { value: "en-US", label: t("settings.dictation.en") },
            ]}
          />
        </Row>
        <Row label={t("settings.appInstall")}>
          {isInstalled ? (
            <p className="flex items-center gap-2 text-sm font-medium text-closed">
              <Smartphone className="h-4 w-4" />
              {t("settings.appInstalled")}
            </p>
          ) : canInstall ? (
            <Button variant="primary" size="sm" onClick={() => triggerInstall()}>
              <Download className="h-4 w-4" />
              {t("settings.appInstallBtn")}
            </Button>
          ) : (
            <p className="text-xs text-ink-3">
              {t("settings.appInstallIosHint")}
            </p>
          )}
        </Row>
        {legacy && (
          <Row label={t("settings.legacy")}>
            <div className="flex flex-col gap-2">
              <p className="text-xs text-ink-3">{t("settings.legacyBody", { vendors: legacy.vendors, cases: legacy.cases })}</p>
              <Button variant="outline" size="sm" className="self-start" onClick={copyAgain} disabled={copying}>
                <DatabaseBackup className="h-4 w-4" />
                {copying ? t("common.loading") : t("settings.legacyButton")}
              </Button>
            </div>
          </Row>
        )}
        <Row label={t("settings.account")}>
          {demo ? (
            <p className="text-sm text-ink-3">{t("settings.demo")}</p>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-sm text-ink-2" dir="ltr">
                {user?.email}
              </span>
              <Button variant="outline" size="sm" onClick={() => signOut()}>
                <LogOut className="h-4 w-4" />
                {t("settings.signOut")}
              </Button>
            </div>
          )}
        </Row>
      </section>
    </div>
  );
}
