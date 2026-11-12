"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import type { MessageKey } from "@/lib/i18n/messages";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  action?: { label: string; run: () => void };
}

interface ToastApi {
  notify(message: string, kind?: ToastKind, action?: Toast["action"]): void;
  /** Run a background write; toast on failure (and on success if a message is given). */
  track(p: Promise<unknown>, success?: string): void;
  /** Human message for an error, in the current language. */
  errorText(e: unknown): string;
}

const ToastContext = createContext<ToastApi | null>(null);

export function errorKey(e: unknown): MessageKey | null {
  const code = e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "";
  if (code.includes("permission-denied")) return "common.noPermission";
  if (code.includes("unavailable") || code.includes("retry-limit-exceeded")) return "common.syncLater";
  if (code.includes("popup-closed-by-user") || code.includes("cancelled-popup-request")) return "signin.cancelled";
  if (code.includes("unauthorized-domain")) return "signin.unauthorizedDomain";
  if (code.includes("popup-blocked")) return "signin.popupBlocked";
  return null;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((x) => x.id !== id)), []);

  const notify = useCallback(
    (message: string, kind: ToastKind = "info", action?: Toast["action"]) => {
      const id = next.current++;
      setToasts((ts) => [...ts.slice(-2), { id, kind, message, action }]);
      setTimeout(() => dismiss(id), action ? 6000 : kind === "error" ? 7000 : 3000);
    },
    [dismiss],
  );

  const errorText = useCallback(
    (e: unknown) => {
      const k = errorKey(e);
      return k ? t(k) : e instanceof Error ? e.message : String(e);
    },
    [t],
  );

  const track = useCallback(
    (p: Promise<unknown>, success?: string) => {
      p.then(
        () => success && notify(success, "success"),
        (e) => notify(errorText(e), "error"),
      );
    },
    [notify, errorText],
  );

  const api = useMemo(() => ({ notify, track, errorText }), [notify, track, errorText]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 print:hidden"
      >
        <AnimatePresence initial={false}>
          {toasts.map((ts) => {
            const Icon = ts.kind === "error" ? CircleAlert : ts.kind === "success" ? CircleCheck : Info;
            return (
              <motion.div
                key={ts.id}
                layout
                initial={{ opacity: 0, y: 24, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.96, transition: { duration: 0.18 } }}
                role={ts.kind === "error" ? "alert" : "status"}
                className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-medium text-ink shadow-[var(--shadow-lift)]"
              >
                <Icon
                  aria-hidden
                  className={`h-5 w-5 shrink-0 ${ts.kind === "error" ? "text-danger" : ts.kind === "success" ? "text-closed" : "text-berry"}`}
                />
                <span>{ts.message}</span>
                {ts.action && (
                  <button
                    type="button"
                    onClick={() => {
                      ts.action!.run();
                      dismiss(ts.id);
                    }}
                    className="ms-2 rounded-full bg-berry-tint px-3 py-1 text-xs font-bold text-berry"
                  >
                    {ts.action.label}
                  </button>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast outside ToastProvider");
  return ctx;
}
