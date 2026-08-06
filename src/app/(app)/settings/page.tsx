import Link from "next/link";
import { redirect } from "next/navigation";
import { authConfigured, auth } from "@/auth";
import { PageHeader, Card } from "@/components/ui";
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

  return (
    <div className="pb-10">
      <PageHeader title="Settings" subtitle="Platform configuration" />

      <div className="grid gap-4 px-6 lg:grid-cols-2">
        {/* Access pointer */}
        <Card className="p-5">
          <div className="mb-3 text-sm font-semibold">Access &amp; Roles</div>
          <p className="text-sm text-muted-foreground">
            User access and role assignment moved to its own section.
          </p>
          <Link
            href="/access"
            className="mt-3 inline-flex items-center rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            Open Access Control
          </Link>
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
