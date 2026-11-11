"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  notify(message: string, kind?: ToastKind): void;
  /** Run a background write; toast on failure (and on success if a message is given). */
  track(p: Promise<unknown>, success?: string): void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "code" in e) {
    const code = String((e as { code: unknown }).code);
    if (code.includes("permission-denied")) return "ليس لديك صلاحية لهذه العملية";
    if (code.includes("unavailable")) return "لا يوجد اتصال — سيتم المزامنة عند عودة الإنترنت";
    if (code.includes("storage/retry-limit-exceeded")) return "فشل رفع التسجيل الصوتي (لا يوجد اتصال)";
    if (code.includes("popup-closed-by-user") || code.includes("cancelled-popup-request")) return "تم إلغاء تسجيل الدخول";
  }
  return e instanceof Error ? e.message : String(e);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);

  const notify = useCallback((message: string, kind: ToastKind = "info") => {
    const id = next.current++;
    setToasts((t) => [...t.slice(-3), { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 7000 : 3500);
  }, []);

  const track = useCallback(
    (p: Promise<unknown>, success?: string) => {
      p.then(
        () => success && notify(success, "success"),
        (e) => notify(errorMessage(e), "error"),
      );
    },
    [notify],
  );

  const api = useMemo(() => ({ notify, track }), [notify, track]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 print:hidden">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={`pointer-events-auto max-w-md rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
              t.kind === "error"
                ? "bg-red-600 text-white"
                : t.kind === "success"
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-800 text-white"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast outside ToastProvider");
  return ctx;
}
