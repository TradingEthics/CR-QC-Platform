import { getScoringCategories } from "@/lib/queries";
import { PageHeader, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

const SEV_ORDER = ["critical_fail", "major", "significant", "minor"];
const SEV_META: Record<string, { label: string; cls: string }> = {
  critical_fail: { label: "Critical Fail −50", cls: "text-red-500" },
  major: { label: "Major −20", cls: "text-orange-500" },
  significant: { label: "Significant −15", cls: "text-amber-500" },
  minor: { label: "Minor −7.5", cls: "text-neutral-500" },
};

export default async function ScorecardPage() {
  const cats = await getScoringCategories();
  const bySev = SEV_ORDER.map((sev) => ({
    sev,
    items: cats.filter((c) => c.severity === sev),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="pb-10">
      <PageHeader
        title="Scorecard"
        subtitle={`${cats.length} QC categories · deduction-based (start at 100)`}
      />
      <div className="space-y-4 px-6">
        {bySev.map(({ sev, items }) => (
          <Card key={sev} className="overflow-hidden p-0">
            <div className={`border-b border-[var(--border)] px-4 py-2.5 text-sm font-semibold ${SEV_META[sev]?.cls}`}>
              {SEV_META[sev]?.label ?? sev} · {items.length}
            </div>
            <div className="divide-y divide-[var(--border)]">
              {items.map((c) => (
                <div key={c.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">{c.error_subtype ?? c.error_type}</div>
                    <div className="flex items-center gap-2">
                      {!c.ai_scoreable && (
                        <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                          manual only
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">−{c.deduction}</span>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{c.description}</p>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
