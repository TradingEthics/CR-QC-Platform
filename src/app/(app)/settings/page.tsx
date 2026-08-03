import { redirect } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { authConfigured, ALLOWED_DOMAIN, auth } from "@/auth";
import { getAppUsers } from "@/lib/queries";
import { PageHeader, Card } from "@/components/ui";
import { UserManagement } from "@/components/user-management";
import { DEFAULT_ROLE } from "@/lib/rbac";

export const dynamic = "force-dynamic";

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border)] py-2.5 text-sm last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}

export default async function SettingsPage() {
  const session = await auth();
  // Admin-only page (middleware also enforces this).
  if (authConfigured && (session?.user?.role ?? DEFAULT_ROLE) !== "admin") {
    redirect("/dashboard");
  }
  const users = await getAppUsers();

  return (
    <div className="pb-10">
      <PageHeader title="Settings" subtitle="Access management and platform configuration" />

      <div className="grid gap-4 px-6 lg:grid-cols-2">
        {/* User Access Management */}
        <Card className="p-5">
          <div className="mb-3 text-sm font-semibold">User Access Management</div>
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-[var(--border)] p-3 text-sm">
            {authConfigured ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <XCircle className="h-4 w-4 text-amber-500" />
            )}
            <span>
              Google OAuth {authConfigured ? "enabled" : "not configured"} — access restricted to{" "}
              <span className="font-medium">@{ALLOWED_DOMAIN}</span>
            </span>
          </div>
          <UserManagement users={users} currentEmail={session?.user?.email ?? null} />
        </Card>

        {/* Scoring configuration */}
        <Card className="p-5">
          <div className="mb-3 text-sm font-semibold">Scoring &amp; Audit</div>
          <Row k="AI provider" v="DeepSeek V4 Flash (OpenRouter)" />
          <Row k="Fallback" v="Gemini 3.6 Flash" />
          <Row k="Pass mark" v="75" />
          <Row k="Bands" v="≥90 Excellent · 80–89 Good · 75–79 Average · <75 Fail" />
          <Row k="AI audit scope" v="CX absent or CX 1–2 (skip CX 3–5)" />
          <Row k="Routing" v="QC < 75 → manual audit" />
          <p className="mt-3 text-[11px] text-muted-foreground">
            These reflect the current worker configuration. Making them editable from here is a
            future enhancement.
          </p>
        </Card>
      </div>
    </div>
  );
}
