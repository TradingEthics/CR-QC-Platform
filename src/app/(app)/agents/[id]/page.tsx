import Link from "next/link";
import { notFound } from "next/navigation";
import { getAgent, getAgentConversations } from "@/lib/queries";
import { PageHeader, StatCard, ScoreCell, CxChip, BandChip, Card } from "@/components/ui";
import { ScoreTrendChart } from "@/components/charts";
import { DateRangeFilter } from "@/components/date-range-filter";
import { rangeFromSearchParams } from "@/lib/date-range";
import { scoreBand, fmtScore, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AgentProfile({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ since?: string; until?: string }>;
}) {
  const { id } = await params;
  const range = rangeFromSearchParams(await searchParams);

  const agent = await getAgent(id);
  if (!agent) notFound();

  const convos = await getAgentConversations(id, range);

  const scored = convos.filter((c) => c.qc_score !== null);
  const avg = scored.length ? scored.reduce((s, c) => s + (c.qc_score as number), 0) / scored.length : null;
  const toAudit = convos.filter((c) => c.review_status === "pending_review").length;

  const trend = [...scored]
    .sort((a, b) => (a.intercom_created_at ?? "").localeCompare(b.intercom_created_at ?? ""))
    .map((c) => ({ date: formatDate(c.intercom_created_at).slice(0, 6), score: c.qc_score as number }));

  return (
    <div className="pb-10">
      <PageHeader title={agent.name} subtitle={agent.email ?? undefined} />

      <div className="px-6 pb-1">
        <DateRangeFilter basePath={`/agents/${id}`} />
      </div>

      <div className="grid grid-cols-2 gap-3 px-6 pt-3 lg:grid-cols-4">
        <StatCard label="Conversations" value={convos.length} />
        <StatCard label="Avg QC" value={fmtScore(avg)} />
        <StatCard label="To audit" value={toAudit} tone={toAudit ? "red" : "default"} hint="<75" />
        <StatCard label="Lowest" value={fmtScore(scored.length ? Math.min(...scored.map((c) => c.qc_score as number)) : null)} />
      </div>

      <div className="px-6 pt-3">
        <Card className="p-4">
          <div className="mb-2 text-sm font-medium">QC score trend</div>
          <ScoreTrendChart data={trend} />
        </Card>
      </div>

      <div className="px-6 pt-5">
        <div className="mb-2 text-sm font-medium text-muted-foreground">
          Conversations · lowest score first (review these)
        </div>
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Subject</th>
                <th className="px-4 py-3 text-center font-medium">CX</th>
                <th className="px-4 py-3 text-center font-medium">QC</th>
                <th className="px-4 py-3 text-center font-medium">Band</th>
                <th className="px-4 py-3 text-center font-medium">Status</th>
                <th className="px-4 py-3 text-center font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {convos.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-[var(--muted)]/40">
                  <td className="max-w-md truncate px-4 py-3">
                    <Link href={`/conversations/${c.id}`} className="text-[var(--primary)] hover:underline">
                      {c.subject ?? "(no subject)"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-center"><CxChip cx={c.cx_score} /></td>
                  <td className="px-4 py-3 text-center"><ScoreCell score={c.qc_score} /></td>
                  <td className="px-4 py-3 text-center"><BandChip band={scoreBand(c.qc_score)} /></td>
                  <td className="px-4 py-3 text-center text-xs text-muted-foreground">{c.review_status.replace("_", " ")}</td>
                  <td className="px-4 py-3 text-center text-xs text-muted-foreground">{formatDate(c.intercom_created_at)}</td>
                </tr>
              ))}
              {convos.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    No scored conversations in this range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
