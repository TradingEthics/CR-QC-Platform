import { redirect } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { authConfigured, ALLOWED_DOMAIN, auth } from "@/auth";
import { getAppUsers } from "@/lib/queries";
import { PageHeader, Card } from "@/components/ui";
import { UserManagement } from "@/components/user-management";
import { ROLE_LABEL, ROLE_DESCRIPTION, ROLES, DEFAULT_ROLE } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function AccessControlPage() {
  const session = await auth();
  // Admin-only (middleware also enforces this).
  if (authConfigured && (session?.user?.role ?? DEFAULT_ROLE) !== "admin") {
    redirect("/dashboard");
  }
  const users = await getAppUsers();

  return (
    <div className="pb-10">
      <PageHeader title="Access Control" subtitle="Assign roles and manage who can access the platform" />

      <div className="grid gap-4 px-6 lg:grid-cols-3">
        {/* Roles + user management */}
        <Card className="p-5 lg:col-span-2">
          <div className="mb-3 text-sm font-semibold">User Access Management</div>
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-[var(--border)] p-3 text-sm">
            {authConfigured ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <XCircle className="h-4 w-4 text-amber-500" />
            )}
            <span>
              Google OAuth {authConfigured ? "enabled" : "not configured"} — sign-in restricted to{" "}
              <span className="font-medium">@{ALLOWED_DOMAIN}</span>
            </span>
          </div>
          <UserManagement users={users} currentEmail={session?.user?.email ?? null} />
        </Card>

        {/* Role reference */}
        <Card className="p-5">
          <div className="mb-3 text-sm font-semibold">Roles</div>
          <div className="space-y-3">
            {ROLES.map((r) => (
              <div key={r} className="rounded-lg border border-[var(--border)] p-3">
                <div className="text-sm font-medium">{ROLE_LABEL[r]}</div>
                <p className="mt-1 text-xs text-muted-foreground">{ROLE_DESCRIPTION[r]}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
