"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { motion } from "motion/react";
import { Clock, KeyRound, LogOut, ShieldAlert, UserPlus, Wrench } from "lucide-react";
import { useData } from "@/components/providers/DataProvider";
import { Button, FlowerMark, LangToggle, TextField } from "@/components/ui";
import { useI18n } from "@/lib/i18n/useI18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { getFirebase } from "@/lib/firebase";
import { isSetupDone } from "@/lib/auth/users";
import { runOwnerSetup, SetupError } from "@/lib/auth/setup";

/** Firebase Auth error → message key. */
export function authErrorKey(e: unknown): MessageKey {
  const code = String((e as { code?: string })?.code ?? "");
  if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(code)) return "auth.err.credentials";
  if (code.includes("email-already-in-use")) return "auth.err.emailInUse";
  if (code.includes("weak-password")) return "auth.err.weakPassword";
  if (code.includes("invalid-email")) return "auth.err.email";
  if (code.includes("too-many-requests")) return "auth.err.tooMany";
  if (code.includes("network-request-failed")) return "auth.err.network";
  if (code.includes("operation-not-allowed")) return "auth.err.notEnabled";
  if (/popup-closed|cancelled-popup/.test(code)) return "signin.cancelled";
  if (code.includes("popup-blocked")) return "signin.popupBlocked";
  if (code.includes("unauthorized-domain")) return "signin.unauthorizedDomain";
  if (code.includes("requires-recent-login")) return "auth.err.recentLogin";
  if (code.includes("permission-denied")) return "common.noPermission";
  return "auth.err.generic";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Frame({ children }: { children: ReactNode }) {
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
        {children}
      </motion.div>
    </div>
  );
}

function Brand({ sub }: { sub?: string }) {
  const { t } = useI18n();
  return (
    <div className="mb-6 text-center">
      <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-gradient-to-b from-[var(--mic-1)] to-[var(--mic-2)] text-on-berry shadow-[var(--shadow-mic)]">
        <FlowerMark className="h-8 w-8" />
      </span>
      <h1 className="text-2xl font-bold" dir="ltr">
        SRM Voice Log
      </h1>
      <p className="mt-1 text-sm text-ink-2">{sub ?? t("app.tagline")}</p>
    </div>
  );
}

function ErrorLine({ text }: { text: string }) {
  return (
    <p role="alert" className="rounded-2xl bg-danger-bg px-3 py-2 text-sm text-danger">
      {text}
    </p>
  );
}

type Mode = "signIn" | "signUp" | "reset" | "setup";

/** Sign in · create account · forgot password (· one-time owner setup). */
export function AuthScreen() {
  const [mode, setMode] = useState<Mode>("signIn");
  const [setupOpen, setSetupOpen] = useState(false);
  const [email, setEmail] = useState("");

  // Offer the one-time setup only until it has been done.
  useEffect(() => {
    let alive = true;
    isSetupDone(getFirebase().db).then((done) => alive && setSetupOpen(!done));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Frame>
      {mode === "setup" ? (
        <SetupForm onBack={() => setMode("signIn")} />
      ) : mode === "reset" ? (
        <ResetForm email={email} setEmail={setEmail} onBack={() => setMode("signIn")} />
      ) : (
        <AccountForm mode={mode} setMode={setMode} email={email} setEmail={setEmail} />
      )}
      {setupOpen && mode !== "setup" && <SetupLink onClick={() => setMode("setup")} />}
    </Frame>
  );
}

function SetupLink({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button type="button" onClick={onClick} className="mt-5 flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-ink-3 hover:text-berry">
      <Wrench className="h-3.5 w-3.5" aria-hidden />
      {t("setup.link")}
    </button>
  );
}

function AccountForm({ mode, setMode, email, setEmail }: { mode: "signIn" | "signUp"; setMode: (m: Mode) => void; email: string; setEmail: (v: string) => void }) {
  const { signIn, signUp } = useData();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Partial<Record<"name" | "email" | "password" | "confirm", MessageKey>>>({});
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const signingUp = mode === "signUp";

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (signingUp && !name.trim()) errs.name = "auth.err.name";
    if (!EMAIL_RE.test(email.trim())) errs.email = "auth.err.email";
    if (password.length < (signingUp ? 8 : 1)) errs.password = signingUp ? "auth.err.weakPassword" : "auth.err.password";
    if (signingUp && confirm !== password) errs.confirm = "auth.err.confirm";
    setErrors(errs);
    setFailure("");
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      if (signingUp) await signUp(name, email, password);
      else await signIn(email, password);
    } catch (err) {
      setFailure(t(authErrorKey(err)));
      setBusy(false);
    }
  }

  return (
    <>
      <Brand sub={signingUp ? t("auth.signUpSub") : undefined} />
      <div role="tablist" className="mb-5 grid grid-cols-2 rounded-full bg-surface-2 p-1 text-sm font-bold">
        {(["signIn", "signUp"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setErrors({});
              setFailure("");
            }}
            className={`h-10 rounded-full transition ${mode === m ? "bg-surface text-berry shadow-[var(--shadow-soft)]" : "text-ink-3"}`}
          >
            {t(m === "signIn" ? "auth.signIn" : "auth.signUp")}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
        {signingUp && <TextField label={t("auth.name")} required value={name} onChange={(e) => setName(e.target.value)} error={errors.name && t(errors.name)} autoComplete="name" />}
        <TextField
          label={t("auth.email")}
          required
          type="email"
          dir="ltr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email && t(errors.email)}
          autoComplete="email"
          inputMode="email"
        />
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
        {failure && <ErrorLine text={failure} />}
        <Button type="submit" size="lg" className="mt-1 w-full" disabled={busy}>
          {signingUp ? <UserPlus className="h-5 w-5" /> : <KeyRound className="h-5 w-5" />}
          {busy ? t("common.loading") : t(signingUp ? "auth.signUpButton" : "auth.signInButton")}
        </Button>
        {signingUp ? (
          <p className="text-center text-xs text-ink-3">{t("auth.approvalNote")}</p>
        ) : (
          <button type="button" onClick={() => setMode("reset")} className="text-center text-sm font-semibold text-berry hover:underline">
            {t("auth.forgot")}
          </button>
        )}
      </form>
    </>
  );
}

function ResetForm({ email, setEmail, onBack }: { email: string; setEmail: (v: string) => void; onBack: () => void }) {
  const { resetPassword } = useData();
  const { t } = useI18n();
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) return setFailure(t("auth.err.email"));
    setBusy(true);
    setFailure("");
    try {
      await resetPassword(email);
      setSent(true);
    } catch (err) {
      // Don't reveal whether an account exists for this email.
      if (String((err as { code?: string }).code ?? "").includes("user-not-found")) setSent(true);
      else setFailure(t(authErrorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Brand sub={t("auth.resetSub")} />
      {sent ? (
        <p className="rounded-2xl bg-closed-bg p-3 text-sm text-ink">{t("auth.resetSent", { email: email.trim() })}</p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
          <TextField label={t("auth.email")} required type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          {failure && <ErrorLine text={failure} />}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? t("common.loading") : t("auth.resetButton")}
          </Button>
        </form>
      )}
      <button type="button" onClick={onBack} className="mt-4 w-full text-center text-sm font-semibold text-berry hover:underline">
        {t("auth.backToSignIn")}
      </button>
    </>
  );
}

/** One-time: the owner signs in with Google once, sets a password, becomes admin, and their data moves to the shared space. */
function SetupForm({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ email: string; vendors: number; cases: number } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setFailure(t("auth.err.name"));
    if (password.length < 8) return setFailure(t("auth.err.weakPassword"));
    if (password !== confirm) return setFailure(t("auth.err.confirm"));
    setBusy(true);
    setFailure("");
    const { auth, db } = getFirebase();
    // No await before this call: it opens the Google popup (see runOwnerSetup).
    runOwnerSetup(auth, db, name, password)
      .then(setDone)
      .catch((err) => setFailure(err instanceof SetupError ? t(`setup.err.${err.reason}`) : t(authErrorKey(err))))
      .finally(() => setBusy(false));
  }

  if (done) {
    return (
      <>
        <Brand sub={t("setup.doneTitle")} />
        <p className="rounded-2xl bg-closed-bg p-3 text-sm text-ink">{t("setup.done", { email: done.email, vendors: done.vendors, cases: done.cases })}</p>
      </>
    );
  }

  return (
    <>
      <Brand sub={t("setup.title")} />
      <p className="mb-4 text-sm text-ink-2">{t("setup.body")}</p>
      <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
        <TextField label={t("auth.name")} required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        <TextField label={t("setup.password")} required type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder={t("auth.passwordHint")} />
        <TextField label={t("auth.confirm")} required type="password" dir="ltr" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        {failure && <ErrorLine text={failure} />}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? t("setup.working") : t("setup.button")}
        </Button>
      </form>
      <button type="button" onClick={onBack} className="mt-4 w-full text-center text-sm font-semibold text-berry hover:underline">
        {t("auth.backToSignIn")}
      </button>
    </>
  );
}

/** Signed in, waiting for an admin. Updates live: approval opens the app by itself. */
export function PendingScreen() {
  const { auth, signOut } = useData();
  const { t } = useI18n();
  const user = auth.status === "pending" ? auth.user : null;
  const error = auth.status === "pending" ? auth.error : undefined;
  return (
    <Frame>
      <div className="text-center">
        <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-open-bg text-open">
          <Clock className="h-8 w-8" aria-hidden />
        </span>
        <h1 className="text-xl font-bold">{t("pending.title", { name: user?.name.split(" ")[0] ?? "" })}</h1>
        <p className="mt-2 text-sm text-ink-2">{t("pending.body")}</p>
        <p className="mt-3 text-xs text-ink-3" dir="ltr">
          {user?.email}
        </p>
        {error && <p className="mt-3 text-xs text-danger">{t("pending.error", { code: error })}</p>}
        <Button variant="outline" className="mt-6 w-full" onClick={() => signOut()}>
          <LogOut className="h-4 w-4" />
          {t("settings.signOut")}
        </Button>
      </div>
    </Frame>
  );
}

export function DisabledScreen() {
  const { auth, signOut } = useData();
  const { t } = useI18n();
  return (
    <Frame>
      <div className="text-center">
        <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-danger-bg text-danger">
          <ShieldAlert className="h-8 w-8" aria-hidden />
        </span>
        <h1 className="text-xl font-bold">{t("disabled.title")}</h1>
        <p className="mt-2 text-sm text-ink-2">{t("disabled.body")}</p>
        <p className="mt-3 text-xs text-ink-3" dir="ltr">
          {auth.status === "disabled" ? auth.user.email : ""}
        </p>
        <Button variant="outline" className="mt-6 w-full" onClick={() => signOut()}>
          <LogOut className="h-4 w-4" />
          {t("settings.signOut")}
        </Button>
      </div>
    </Frame>
  );
}
