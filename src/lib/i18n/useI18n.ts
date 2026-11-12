"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useGender, useLang, useThemePref } from "@/hooks/useVoicePrefs";
import { translate, type MessageKey } from "./messages";
import { parseISO } from "../dates";

export function useI18n() {
  const [lang, setLang] = useLang();
  const [gender] = useGender();
  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, gender, key, vars),
    [lang, gender],
  );
  return useMemo(() => {
    const locale = lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB";
    return {
      lang,
      setLang,
      gender,
      isAr: lang === "ar",
      dir: lang === "ar" ? ("rtl" as const) : ("ltr" as const),
      t,
      /** "الخميس · 13 نوفمبر" / "Thursday · 13 Nov" — Latin digits in both. */
      todayLine(now = new Date()) {
        const wd = new Intl.DateTimeFormat(locale, { weekday: "long" }).format(now);
        const dm = new Intl.DateTimeFormat(locale, { day: "numeric", month: lang === "ar" ? "long" : "short" }).format(now);
        return `${wd} · ${dm}`;
      },
      monthShort(iso: string) {
        const p = parseISO(iso);
        if (!p) return "";
        return new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(p.y, p.m - 1, 1)));
      },
      /** Vendor name in the UI language, falling back to the other one. */
      vendorName(v: { nameAr: string; nameEn: string } | undefined | null) {
        if (!v) return "—";
        return (lang === "en" ? v.nameEn || v.nameAr : v.nameAr || v.nameEn) || "—";
      },
      /** The other-language name, shown as a subtitle when both exist. */
      vendorAltName(v: { nameAr: string; nameEn: string }) {
        return v.nameAr && v.nameEn ? (lang === "en" ? v.nameAr : v.nameEn) : "";
      },
      num(n: number) {
        return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
      },
    };
  }, [lang, setLang, gender, t]);
}

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

/** Resolved theme: "evening" when chosen, or when "system" and the OS is dark. */
export function useResolvedTheme(): "light" | "evening" {
  const [pref] = useThemePref();
  const systemDark = useSyncExternalStore(
    (cb) => {
      const q = darkQuery();
      q.addEventListener("change", cb);
      return () => q.removeEventListener("change", cb);
    },
    () => darkQuery().matches,
    () => false,
  );
  return pref === "evening" || (pref === "system" && systemDark) ? "evening" : "light";
}

/** Keeps <html lang/dir/class> in step with the preferences. */
export function useDocumentPrefs() {
  const { lang, dir } = useI18n();
  const theme = useResolvedTheme();
  useEffect(() => {
    const el = document.documentElement;
    el.lang = lang;
    el.dir = dir;
    el.classList.toggle("dark", theme === "evening");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "evening" ? "#1e121f" : "#fcf6f1");
  }, [lang, dir, theme]);
}

/** Inline script (runs before paint) — avoids a flash of the wrong direction/theme. */
export const PRE_PAINT_SCRIPT = `(function(){try{var l=localStorage.getItem("srm:lang")||"ar";var t=localStorage.getItem("srm:theme")||"light";var d=document.documentElement;d.lang=l;d.dir=l==="ar"?"rtl":"ltr";if(t==="evening"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches))d.classList.add("dark");}catch(e){}})();`;
