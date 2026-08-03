"use client";

import { useState, useTransition } from "react";
import { UserPlus, Trash2, Loader2 } from "lucide-react";
import { setUserRole, removeUser } from "@/app/actions/users";
import { ROLES, ROLE_LABEL, ROLE_DESCRIPTION, type Role } from "@/lib/rbac";
import type { AppUser } from "@/lib/queries";

const ROLE_BADGE: Record<Role, string> = {
  admin: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  reviewer: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  agent: "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
};

export function UserManagement({
  users,
  currentEmail,
}: {
  users: AppUser[];
  currentEmail: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<Role>("reviewer");
  const [busyEmail, setBusyEmail] = useState<string | null>(null);

  function changeRole(email: string, role: Role) {
    setError(null);
    setBusyEmail(email);
    startTransition(async () => {
      const res = await setUserRole(email, role);
      if (!res.ok) setError(res.error ?? "Failed");
      setBusyEmail(null);
    });
  }

  function addUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await setUserRole(newEmail, newRole);
      if (!res.ok) setError(res.error ?? "Failed");
      else setNewEmail("");
    });
  }

  function remove(email: string) {
    setError(null);
    setBusyEmail(email);
    startTransition(async () => {
      const res = await removeUser(email);
      if (!res.ok) setError(res.error ?? "Failed");
      setBusyEmail(null);
    });
  }

  return (
    <div>
      {/* Add user */}
      <form onSubmit={addUser} className="mb-4 flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[180px]">
          <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Email</label>
          <input
            type="email"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="name@nextventures.io"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm outline-none focus:border-[var(--primary)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Role</label>
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as Role)}
            className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm outline-none focus:border-[var(--primary)]"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Add / Update
        </button>
      </form>

      {error && (
        <div className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <p className="mb-2 text-[11px] text-muted-foreground">{ROLE_DESCRIPTION[newRole]}</p>

      {/* User list */}
      <div className="max-h-96 space-y-1 overflow-y-auto">
        {users.map((u) => {
          const isSelf = currentEmail?.toLowerCase() === u.email.toLowerCase();
          const busy = busyEmail === u.email && pending;
          return (
            <div
              key={u.email}
              className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {u.email}
                  {isSelf && <span className="ml-1.5 text-[10px] text-muted-foreground">(you)</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${ROLE_BADGE[u.role]}`}>
                  {ROLE_LABEL[u.role]}
                </span>
                <select
                  value={u.role}
                  disabled={busy || isSelf}
                  onChange={(e) => changeRole(u.email, e.target.value as Role)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs outline-none disabled:opacity-50"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                  ))}
                </select>
                <button
                  onClick={() => remove(u.email)}
                  disabled={busy || isSelf}
                  title="Remove (reverts to default agent)"
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-30 dark:hover:bg-red-950"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          );
        })}
        {users.length === 0 && (
          <div className="py-6 text-center text-xs text-muted-foreground">No users assigned yet.</div>
        )}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Role changes take effect on the user&apos;s next sign-in. Users not listed here default to{" "}
        <span className="font-medium">Agent</span> (read-only dashboard).
      </p>
    </div>
  );
}
