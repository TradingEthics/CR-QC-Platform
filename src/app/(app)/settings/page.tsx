import { CheckCircle2, XCircle } from "lucide-react";
import { authConfigured, ALLOWED_DOMAIN, auth } from "@/auth";
import { getCrAgents } from "@/lib/queries";
import { PageHeader, Card } from "@/components/ui";

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
  const [agents, session] = await Promise.all([getCrAgents(), auth()]);

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
          {session?.user && (
            <Row k="Signed in as" v={session.user.email ?? session.user.name ?? "—"} />
          )}
          <div className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Reviewers &amp; agents ({agents.length})
          </div>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {agents.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--muted)]/50">
                <span>{a.name}</span>
                <span className="text-xs text-muted-foreground">{a.email}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Anyone with a verified @{ALLOWED_DOMAIN} Google account can sign in. Per-user roles
            (reviewer vs. admin) can be added on top of this list.
          </p>
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
