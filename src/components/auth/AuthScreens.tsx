"use client";

import { useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { KeyRound, UserPlus } from "lucide-react";
import { useData } from "@/components/providers/DataProvider";
import { Button, FlowerMark, LangToggle, TextField } from "@/components/ui";
import { useI18n } from "@/lib/i18n/useI18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { MIN_PASSWORD, nameProblem } from "@/lib/auth/username";

/** Firebase Auth error → message key. */
export function authErrorKey(e: unknown, signingUp: boolean): MessageKey {
  const code = String((e as { code?: string })?.code ?? "");
  if (/invalid-credential|wrong-password|user-not-found|invalid-login|invalid-email/.test(code)) return "auth.err.credentials";
  if (code.includes("email-already-in-use")) return "auth.err.nameTaken";
  if (code.includes("weak-password")) return "auth.err.weakPassword";
  if (code.includes("too-many-requests")) return "auth.err.tooMany";
  if (code.includes("network-request-failed")) return "auth.err.network";
  if (code.includes("operation-not-allowed")) return "auth.err.notEnabled";
  return signingUp ? "auth.err.signUp" : "auth.err.generic";
}

/** Sign in, or create an account: just a name and a password. */
export function AuthScreen() {
  const { signIn, signUp } = useData();
  const { t } = useI18n();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Partial<Record<"name" | "password" | "confirm", MessageKey>>>({});
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const signingUp = mode === "signUp";

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    const np = nameProblem(name);
    if (np) errs.name = np === "short" ? "auth.err.name" : "auth.err.nameLong";
    if (!password) errs.password = "auth.err.password";
    else if (signingUp && password.length < MIN_PASSWORD) errs.password = "auth.err.weakPassword";
    if (signingUp && confirm !== password) errs.confirm = "auth.err.confirm";
    setErrors(errs);
    setFailure("");
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      if (signingUp) await signUp(name, password);
      else await signIn(name, password);
    } catch (err) {
      setFailure(t(authErrorKey(err, signingUp)));
      setBusy(false);
    }
  }

  function switchTo(m: "signIn" | "signUp") {
    setMode(m);
    setErrors({});
    setFailure("");
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-10">
      <div className="absolute end-5 top-5">
        <LangToggle />
      </div>
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.span
          key={i}
          aria-hidden
          className="absolute text-berry/20"
          style={{ left: `${12 + i * 18}%`, top: `${10 + ((i * 37) % 70)}%` }}
          animate={{ y: [0, -14, 0], rotate: [0, 20, 0] }}
          transition={{ duration: 5 + i, repeat: Infinity, ease: "easeInOut" }}
        >
          <FlowerMark className="h-8 w-8" />
        </motion.span>
      ))}
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 24 }}
        className="card relative w-full max-w-sm p-7"
      >
        <div className="mb-6 text-center">
          <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-gradient-to-b from-[var(--mic-1)] to-[var(--mic-2)] text-on-berry shadow-[var(--shadow-mic)]">
            <FlowerMark className="h-8 w-8" />
          </span>
          <h1 className="text-2xl font-bold" dir="ltr">
            SRM Voice Log
          </h1>
          <p className="mt-1 text-sm text-ink-2">{t("app.tagline")}</p>
        </div>

        <div role="tablist" className="mb-5 grid grid-cols-2 rounded-full bg-surface-2 p-1 text-sm font-bold">
          {(["signIn", "signUp"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => switchTo(m)}
              className={`h-10 rounded-full transition ${mode === m ? "bg-surface text-berry shadow-[var(--shadow-soft)]" : "text-ink-3"}`}
            >
              {t(m === "signIn" ? "auth.signIn" : "auth.signUp")}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
          <TextField label={t("auth.name")} required value={name} onChange={(e) => setName(e.target.value)} error={errors.name && t(errors.name)} autoComplete="username" dir="auto" />
          <TextField
            label={t("auth.password")}
            required
            type="password"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password && t(errors.password)}
            autoComplete={signingUp ? "new-password" : "current-password"}
            placeholder={signingUp ? t("auth.passwordHint") : undefined}
          />
          {signingUp && (
            <TextField
              label={t("auth.confirm")}
              required
              type="password"
              dir="ltr"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              error={errors.confirm && t(errors.confirm)}
              autoComplete="new-password"
            />
          )}
          {failure && (
            <p role="alert" className="rounded-2xl bg-danger-bg px-3 py-2 text-sm text-danger">
              {failure}
            </p>
          )}
          <Button type="submit" size="lg" className="mt-1 w-full" disabled={busy}>
            {signingUp ? <UserPlus className="h-5 w-5" /> : <KeyRound className="h-5 w-5" />}
            {busy ? t("common.loading") : t(signingUp ? "auth.signUpButton" : "auth.signInButton")}
          </Button>
          {signingUp && <p className="text-center text-xs text-ink-3">{t("auth.signUpNote")}</p>}
        </form>
      </motion.div>
    </div>
  );
}
