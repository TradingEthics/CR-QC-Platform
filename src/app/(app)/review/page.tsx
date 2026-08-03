import Link from "next/link";
import { getReviewQueue, getCrAgents } from "@/lib/queries";
import { PageHeader, ScoreCell, CxChip, BandChip, Card } from "@/components/ui";
import { AuditFilters } from "@/components/audit-filters";
import { rangeFromSearchParams } from "@/lib/date-range";
import { scoreBand, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string; status?: string; since?: string; until?: string }>;
}) {
  const sp = await searchParams;
  const range = rangeFromSearchParams(sp);
  const status = sp.status === "all" ? "all" : "pending";

  const [queue, agents] = await Promise.all([
    getReviewQueue({ agentId: sp.agent, range, status }),
    getCrAgents(),
  ]);
  const agentOpts = agents
    .map((a) => ({ id: a.id, name: a.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="pb-10">
      <PageHeader
        title="Audit Queue"
        subtitle={
          status === "pending"
            ? `${queue.length} conversation${queue.length === 1 ? "" : "s"} pending manual audit`
            : `${queue.length} conversation${queue.length === 1 ? "" : "s"} in range`
        }
      />

      <div className="px-6 pb-3">
        <AuditFilters agents={agentOpts} />
      </div>

      <div className="px-6">
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Subject</th>
                <th className="px-4 py-3 font-medium">Agent</th>
                <th className="px-4 py-3 text-center font-medium">CX</th>
                <th className="px-4 py-3 text-center font-medium">QC</th>
                <th className="px-4 py-3 text-center font-medium">Band</th>
                <th className="px-4 py-3 text-center font-medium">Status</th>
                <th className="px-4 py-3 text-center font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {queue.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-[var(--muted)]/40">
                  <td className="max-w-md truncate px-4 py-3">
                    <Link href={`/conversations/${c.id}`} className="text-[var(--primary)] hover:underline">
                      {c.subject ?? "(no subject)"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.agent_name ?? "—"}</td>
                  <td className="px-4 py-3 text-center"><CxChip cx={c.cx_score} /></td>
                  <td className="px-4 py-3 text-center"><ScoreCell score={c.qc_score} /></td>
                  <td className="px-4 py-3 text-center"><BandChip band={scoreBand(c.qc_score)} /></td>
                  <td className="px-4 py-3 text-center text-xs text-muted-foreground">{c.review_status.replace("_", " ")}</td>
                  <td className="px-4 py-3 text-center text-xs text-muted-foreground">{formatDate(c.intercom_created_at)}</td>
                </tr>
              ))}
              {queue.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    No conversations match these filters.
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
