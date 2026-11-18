"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, animate, motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import { CircleAlert, CircleCheck, Target, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";

// --- Buttons ----------------------------------------------------------------

type Variant = "primary" | "soft" | "outline" | "ghost" | "danger";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-berry text-on-berry shadow-[var(--shadow-mic)] hover:bg-berry-strong",
  soft: "bg-surface-pink text-berry hover:bg-berry-tint",
  outline: "bg-surface text-ink border border-line-strong hover:bg-surface-2",
  ghost: "text-ink-2 hover:bg-surface-2",
  danger: "bg-danger text-white hover:opacity-90 dark:text-[#2a0710]",
};
const SIZES = { sm: "h-9 px-3.5 text-sm", md: "h-11 px-5 text-sm", lg: "h-13 px-6 text-base" };

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: Omit<HTMLMotionProps<"button">, "ref"> & { variant?: Variant; size?: keyof typeof SIZES }) {
  return (
    <motion.button
      type="button"
      whileTap={props.disabled ? undefined : { scale: 0.96 }}
      {...props}
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry disabled:cursor-not-allowed disabled:opacity-45 ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function IconButton({
  label,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-2 shadow-[var(--shadow-soft)] transition hover:text-berry active:scale-95 focus-visible:outline-2 focus-visible:outline-berry disabled:opacity-40 ${className}`}
    />
  );
}

// --- Fields -----------------------------------------------------------------

const fieldBase =
  "w-full rounded-2xl border bg-surface px-4 text-base text-ink placeholder:text-ink-3 transition focus:outline-none focus:ring-4 focus:ring-berry-tint focus:border-berry";

export function TextField({
  label,
  error,
  required,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; error?: string; required?: boolean }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
        {required && <span className="text-danger">*</span>}
      </label>
      <input
        id={id}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : undefined}
        {...props}
        className={`${fieldBase} h-12 ${error ? "border-danger bg-danger-bg" : "border-line-strong"} ${className}`}
      />
      <AnimatePresence>
        {error && (
          <motion.p
            id={`${id}-err`}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-1 text-xs font-medium text-danger"
          >
            <CircleAlert className="h-3.5 w-3.5" aria-hidden />
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

export function TextAreaField({
  label,
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      <textarea id={id} rows={2} {...props} className={`${fieldBase} border-line-strong py-3 ${className}`} />
    </div>
  );
}

// --- Overlay: bottom sheet on phones, centered dialog on desktop ---------------

function useLockScroll(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}

function useIsDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const q = matchMedia("(min-width: 768px)");
    const on = () => setDesktop(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return desktop;
}

export function Sheet({
  open,
  title,
  onClose,
  children,
  hideHeader = false,
  labelledBy,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  hideHeader?: boolean;
  labelledBy?: string;
}) {
  const { t } = useI18n();
  const desktop = useIsDesktop();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useLockScroll(open);

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    // Focus the first field (or the panel) when it opens.
    const id = requestAnimationFrame(() => {
      const first = panelRef.current?.querySelector<HTMLElement>("input,textarea,select,[data-autofocus]");
      (first ?? panelRef.current)?.focus();
    });
    return () => {
      document.removeEventListener("keydown", onKey);
      cancelAnimationFrame(id);
      prevFocus?.focus?.();
    };
  }, [open, onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
          <motion.div
            className="absolute inset-0 bg-[#0b1220]/45 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy ?? titleId}
            tabIndex={-1}
            initial={desktop ? { opacity: 0, scale: 0.95, y: 12 } : { y: "100%" }}
            animate={desktop ? { opacity: 1, scale: 1, y: 0 } : { y: 0 }}
            exit={desktop ? { opacity: 0, scale: 0.97, y: 8 } : { y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            drag={desktop ? false : "y"}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
            className="relative flex max-h-[92dvh] w-full flex-col rounded-t-[2rem] bg-surface pb-[env(safe-area-inset-bottom)] shadow-[var(--shadow-lift)] outline-none md:max-w-lg md:rounded-[2rem]"
          >
            <div className="mx-auto mt-2.5 h-1.5 w-12 rounded-full bg-line-strong md:hidden" aria-hidden />
            {!hideHeader && (
              <div className="flex items-center justify-between gap-3 px-6 pb-2 pt-4">
                <h2 id={titleId} className="text-xl font-bold text-ink">
                  {title}
                </h2>
                <IconButton label={t("common.close")} onClick={onClose}>
                  <X className="h-5 w-5" />
                </IconButton>
              </div>
            )}
            <div className="overflow-y-auto px-6 pb-6 pt-2">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Danger confirmation. With `confirmText`, the button unlocks only once it's typed. */
export function ConfirmDialog({
  open,
  title,
  body,
  icon,
  confirmLabel,
  cancelLabel,
  confirmText,
  confirmPrompt,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  icon: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  confirmText?: string;
  confirmPrompt?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const titleId = useId();
  const ok = !confirmText || typed.trim() === confirmText;
  return (
    <Sheet
      open={open}
      title={title}
      hideHeader
      labelledBy={titleId}
      onClose={() => {
        setTyped("");
        onClose();
      }}
    >
      <div className="flex flex-col items-center gap-3 pt-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-danger/40 bg-danger-bg text-danger">
          {icon}
        </span>
        <h2 id={titleId} className="text-xl font-bold text-ink">
          {title}
        </h2>
        <div className="text-sm leading-relaxed text-ink-2">{body}</div>
        {confirmText && (
          <div className="w-full text-start">
            <TextField
              label={confirmPrompt}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              dir="ltr"
              inputMode="numeric"
              autoComplete="off"
            />
          </div>
        )}
        <div className="mt-2 flex w-full flex-col gap-2">
          <Button
            variant="danger"
            size="lg"
            disabled={!ok}
            onClick={() => {
              setTyped("");
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
          <Button
            variant="outline"
            size="lg"
            data-autofocus
            onClick={() => {
              setTyped("");
              onClose();
            }}
          >
            {cancelLabel}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

// --- Small pieces -------------------------------------------------------------

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className = "",
  size = "md",
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode }>;
  onChange: (v: T) => void;
  label: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className={`relative flex rounded-full bg-surface-2 p-1 ${className}`}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`relative flex-1 whitespace-nowrap rounded-full font-semibold transition-colors ${size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm"} ${on ? "text-berry" : "text-ink-3 hover:text-ink-2"}`}
          >
            {on && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-full bg-surface shadow-[var(--shadow-soft)]"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** «EN | ع» pill — the active language sits in a berry circle that slides across. */
export function LangToggle() {
  const { lang, setLang, t } = useI18n();
  // Unique per instance: the phone top bar and the desktop sidebar both mount one.
  const thumbId = useId();
  return (
    <button
      type="button"
      onClick={() => setLang(lang === "ar" ? "en" : "ar")}
      aria-label={t("lang.switch")}
      title={t("lang.switch")}
      dir="ltr"
      className="relative flex h-10 items-center gap-1 rounded-full border border-line bg-surface p-1 shadow-[var(--shadow-soft)]"
    >
      {(["en", "ar"] as const).map((l) => (
        <span key={l} className={`relative flex h-8 w-9 items-center justify-center text-sm font-bold ${lang === l ? "text-on-berry" : "text-ink-3"}`}>
          {lang === l && (
            <motion.span layoutId={`lang-${thumbId}`} className="absolute inset-0 rounded-full bg-berry" transition={{ type: "spring", stiffness: 500, damping: 34 }} />
          )}
          <span className="relative">{l === "en" ? "EN" : "ع"}</span>
        </span>
      ))}
    </button>
  );
}

/**
 * DMC Contracting | Curve Landscape. The logo has black lettering, so in dark
 * mode it sits on a small white card to stay readable.
 */
export function BrandLogo({ className = "h-9" }: { className?: string }) {
  return (
    <span className="inline-flex shrink-0 rounded-xl dark:bg-white dark:px-2 dark:py-1" dir="ltr">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand-logo.webp" alt="DMC Contracting · Curve Landscape" width={640} height={245} className={`w-auto ${className}`} draggable={false} />
    </span>
  );
}

export function Logo({ full = false }: { full?: boolean }) {
  return full ? (
    <span className="flex flex-col items-start gap-2" dir="ltr">
      <BrandLogo className="h-12" />
      <span className="text-sm font-bold tracking-wide text-ink-2">SRM Voice Log</span>
    </span>
  ) : (
    <BrandLogo className="h-9" />
  );
}

export function Monogram({ name, className = "h-11 w-11 text-lg" }: { name: string; className?: string }) {
  // Skip the Arabic article: «المصرية» → «م» (as in the design).
  const letter = (name.trim().replace(/^ال(?=\S)/, "")[0] ?? "?").toUpperCase();
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-2xl bg-surface-pink font-bold text-berry ${className}`}>
      {letter}
    </span>
  );
}

export function StatusPill({ status }: { status: "open" | "closed" }) {
  const { t } = useI18n();
  return status === "open" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-open-bg px-2.5 py-1 text-xs font-bold text-open">
      <Target className="h-3.5 w-3.5" aria-hidden />
      {t("status.open")}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-closed-bg px-2.5 py-1 text-xs font-bold text-closed">
      <CircleCheck className="h-3.5 w-3.5" aria-hidden />
      {t("status.closed")}
    </span>
  );
}

/** Round status icon used at the end of compact rows. */
export function StatusIcon({ status }: { status: "open" | "closed" }) {
  const { t } = useI18n();
  return status === "open" ? (
    <Target role="img" aria-label={t("status.open")} className="h-5 w-5 shrink-0 text-open" />
  ) : (
    <CircleCheck role="img" aria-label={t("status.closed")} className="h-5 w-5 shrink-0 text-closed" />
  );
}

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return <span role="status" className={`inline-block animate-spin rounded-full border-2 border-berry-soft border-t-berry ${className}`} />;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <span className={`relative block overflow-hidden rounded-full bg-surface-2 ${className}`} aria-hidden>
      <span className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-surface/70 to-transparent" />
    </span>
  );
}

export function LoadingBlock() {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-ink-3">
      <Spinner />
      <span>{t("common.loading")}</span>
    </div>
  );
}

export function SproutArt({ className = "h-24 w-28" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 100" className={className} aria-hidden fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 86h76" stroke="var(--line-strong)" strokeWidth="2" />
      <path d="M60 86V46" stroke="var(--closed)" strokeWidth="2.4" />
      <path d="M60 60c-14 0-24-8-26-20 13-1 24 6 26 20Z" stroke="var(--closed)" strokeWidth="2.4" fill="var(--closed-bg)" />
      <path d="M60 50c3-14 14-22 28-21-1 14-12 22-28 21Z" stroke="var(--closed)" strokeWidth="2.4" fill="var(--closed-bg)" />
      <path d="M60 46c-2-8 0-15 6-20" stroke="var(--closed)" strokeWidth="2.4" />
      {[
        [26, 24],
        [96, 14],
        [100, 56],
      ].map(([x, y]) => (
        <path key={`${x}-${y}`} d={`M${x} ${y - 5}v10M${x - 5} ${y}h10`} stroke="var(--berry)" strokeWidth="2" />
      ))}
    </svg>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="card flex flex-col items-center gap-3 px-6 py-10 text-center"
    >
      <SproutArt />
      <p className="text-lg font-bold text-ink">{title}</p>
      {body && <div className="text-sm text-ink-2">{body}</div>}
      {action && <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>}
    </motion.div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  const { t } = useI18n();
  const code = String((error as { code?: string }).code ?? "");
  // The most likely setup problem gets an actionable message instead of Firebase's raw text.
  const message = code.includes("permission-denied") ? t("common.rulesMissing") : error.message;
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-danger/30 bg-danger-bg px-6 py-10 text-center">
      <CircleAlert className="h-8 w-8 text-danger" aria-hidden />
      <p className="font-bold text-ink">{t("common.loadError")}</p>
      <p className="text-sm text-ink-2" dir="auto">
        {message}
      </p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      )}
    </div>
  );
}

/** Number that rolls to its new value (e.g. "today" after saving a case). */
export function CountUp({ value, className = "" }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = prev.current;
    prev.current = value;
    if (reduce || from === value) {
      el.textContent = value.toLocaleString("en-US");
      return;
    }
    const controls = animate(from, value, {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => (el.textContent = Math.round(v).toLocaleString("en-US")),
    });
    return () => controls.stop();
  }, [value, reduce]);
  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {value.toLocaleString("en-US")}
    </span>
  );
}

/** Renders a message whose {slot} gets special styling (e.g. the highlighted name). */
export function Slotted({ text, slot, value, className = "highlight" }: { text: string; slot: string; value: ReactNode; className?: string }) {
  const [before, after] = text.split(`{${slot}}`);
  if (after === undefined) return <>{text}</>;
  return (
    <>
      {before}
      <span className={className}>{value}</span>
      {after}
    </>
  );
}
