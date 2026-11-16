"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Crown, Power, Trash2, UserX } from "lucide-react";
import { DesktopHeader, TopBar } from "@/components/AppShell";
import { useData, useProfile } from "@/components/providers/DataProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button, ConfirmDialog, EmptyState, ErrorState, LoadingBlock, Monogram } from "@/components/ui";
import { useI18n } from "@/lib/i18n/useI18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { getFirebase } from "@/lib/firebase";
import { removeUser, setUserRole, setUserStatus, watchUsers, type UserProfile, type UserStatus } from "@/lib/auth/users";
import { formatDMY } from "@/lib/dates";

const STATUS_ORDER: Record<UserStatus, number> = { pending: 0, approved: 1, disabled: 2 };

/** Admin: approve new accounts, turn access off, make someone admin. */
export function UsersPage() {
  const { t } = useI18n();
  const me = useProfile();
  const { demo } = useData();
  const { track } = useToast();
  const [users, setUsers] = useState<UserProfile[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [removing, setRemoving] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (demo || me?.role !== "admin") return;
    return watchUsers(getFirebase().db, setUsers, setError);
  }, [demo, me?.role]);

  const sorted = useMemo(
    () => (users ?? []).slice().sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.createdAt - a.createdAt),
    [users],
  );
  const pending = sorted.filter((u) => u.status === "pending").length;

  if (demo || me?.role !== "admin") {
    return (
      <div>
        <TopBar title={t("users.title")} />
        <EmptyState
          title={t("users.adminOnly")}
          action={
            <Link href="/" className="font-semibold text-berry underline">
              {t("vendor.backToList")}
            </Link>
          }
        />
      </div>
    );
  }
  if (error) return <ErrorState error={error} />;
  if (!users) return <LoadingBlock />;

  const db = getFirebase().db;
  return (
    <div className="flex flex-col gap-4">
      <TopBar title={t("users.title")} />
      <DesktopHeader title={t("users.title")} />
      <p className="text-sm text-ink-2">{pending ? t("users.pendingCount", { n: pending }) : t("users.intro")}</p>

      <ul className="flex flex-col gap-3">
        {sorted.map((u) => {
          const self = u.uid === me.uid;
          return (
            <li key={u.uid} className={`card flex flex-col gap-3 p-4 sm:flex-row sm:items-center ${u.status === "pending" ? "!border-open/40 !bg-open-bg/40" : ""}`}>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Monogram name={u.name || u.email} className="h-11 w-11 rounded-full text-base" />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-bold">
                    <span className="truncate">{u.name || "—"}</span>
                    {self && <span className="text-xs font-semibold text-ink-3">({t("users.you")})</span>}
                    <StatusChip status={u.status} />
                    {u.role === "admin" && (
                      <span className="flex items-center gap-1 rounded-full bg-surface-pink px-2 py-0.5 text-xs font-bold text-berry">
                        <Crown className="h-3 w-3" aria-hidden />
                        {t("users.admin")}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-sm text-ink-3" dir="ltr" style={{ textAlign: "start" }}>
                    {u.email}
                  </p>
                  {u.createdAt > 0 && <p className="text-xs text-ink-3">{t("users.since", { date: formatDMY(new Date(u.createdAt).toISOString().slice(0, 10)) })}</p>}
                </div>
              </div>
              {!self && (
                <div className="flex flex-wrap gap-2">
                  {u.status !== "approved" && (
                    <Button size="sm" onClick={() => track(setUserStatus(db, u.uid, "approved"), t("users.approved", { name: u.name }))}>
                      <Check className="h-4 w-4" />
                      {t(u.status === "pending" ? "users.approve" : "users.enable")}
                    </Button>
                  )}
                  {u.status === "approved" && (
                    <Button size="sm" variant="outline" onClick={() => track(setUserStatus(db, u.uid, "disabled"), t("users.disabled", { name: u.name }))}>
                      <Power className="h-4 w-4" />
                      {t("users.disable")}
                    </Button>
                  )}
                  {u.status === "approved" && (
                    <Button size="sm" variant="outline" onClick={() => track(setUserRole(db, u.uid, u.role === "admin" ? "member" : "admin"))}>
                      <Crown className="h-4 w-4" />
                      {t(u.role === "admin" ? "users.makeMember" : "users.makeAdmin")}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setRemoving(u)} aria-label={t(u.status === "pending" ? "users.reject" : "users.remove")}>
                    {u.status === "pending" ? <UserX className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                    {t(u.status === "pending" ? "users.reject" : "users.remove")}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={!!removing}
        icon={<Trash2 className="h-6 w-6" />}
        title={t("users.removeTitle", { name: removing?.name || removing?.email || "" })}
        body={t("users.removeBody")}
        confirmLabel={t("users.remove")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          if (removing) track(removeUser(db, removing.uid), t("users.removed"));
          setRemoving(null);
        }}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
}

function StatusChip({ status }: { status: UserStatus }) {
  const { t } = useI18n();
  const styles: Record<UserStatus, string> = {
    pending: "bg-open-bg text-open",
    approved: "bg-closed-bg text-closed",
    disabled: "bg-surface-2 text-ink-3",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${styles[status]}`}>{t(`users.status.${status}` as MessageKey)}</span>;
}
