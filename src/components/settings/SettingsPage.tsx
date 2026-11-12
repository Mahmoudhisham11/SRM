"use client";

import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { TopBar, DesktopHeader } from "@/components/AppShell";
import { useData } from "@/components/providers/DataProvider";
import { Button, Segmented } from "@/components/ui";
import { useI18n } from "@/lib/i18n/useI18n";
import { useDictationLang, useDisplayName, useGender, useLang, useThemePref, type DictationLang, type ThemePref } from "@/hooks/useVoicePrefs";
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
  const user = auth.status === "signedIn" ? auth.user : null;

  return (
    <div className="mx-auto max-w-2xl">
      <TopBar back="/" title={t("settings.title")} />
      <DesktopHeader title={t("settings.title")} />
      <section className="card px-5 sm:px-6">
        <Row label={t("settings.name")}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={user?.name.split(" ")[0] ?? ""}
            aria-label={t("settings.name")}
            className="h-11 w-full rounded-full border border-line-strong bg-surface px-4 focus:outline-none focus:ring-4 focus:ring-berry-tint"
          />
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
