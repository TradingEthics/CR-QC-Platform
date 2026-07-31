import Link from "next/link";
import { notFound } from "next/navigation";
import { getAgent, getAgentConversations } from "@/lib/queries";
import { PageHeader, StatCard, ScoreCell, CxChip, BandChip } from "@/components/ui";
import { ScoreTrendChart } from "@/components/charts";
import { scoreBand, fmtScore, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const RANGES: Record<string, { label: string; days: number | null }> = {
  "7d": { label: "Last 7 days", days: 7 },
  "30d": { label: "Last 30 days", days: 30 },
  all: { label: "All time", days: null },
};

export default async function AgentProfile({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { id } = await params;
  const { range = "7d" } = await searchParams;
  const sel = RANGES[range] ?? RANGES["7d"];

  const agent = await getAgent(id);
  if (!agent) notFound();

  const sinceIso = sel.days
    ? new Date(Date.now() - sel.days * 86400_000).toISOString()
    : undefined;
  const convos = await getAgentConversations(id, sinceIso);

  const scored = convos.filter((c) => c.qc_score !== null);
  const avg = scored.length
    ? scored.reduce((s, c) => s + (c.qc_score as number), 0) / scored.length
    : null;
  const toAudit = convos.filter((c) => c.review_status === "pending_review").length;

  // trend: chronological
  const trend = [...scored]
    .sort((a, b) => (a.intercom_created_at ?? "").localeCompare(b.intercom_created_at ?? ""))
    .map((c) => ({ date: formatDate(c.intercom_created_at).slice(0, 6), score: c.qc_score as number }));

  return (
    <div>
      <PageHeader
        title={agent.name}
        subtitle={agent.email ?? undefined}
        right={
          <div className="flex gap-1 rounded-lg border border-neutral-200 p-1 dark:border-neutral-800">
            {Object.entries(RANGES).map(([key, r]) => (
              <Link
                key={key}
                href={`/agents/${id}?range=${key}`}
                className={`rounded-md px-3 py-1 text-xs font-medium ${
                  key === range
                    ? "bg-sky-600 text-white"
                    : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                }`}
              >
                {r.label}
              </Link>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 px-6 py-5 lg:grid-cols-4">
        <StatCard label="Conversations" value={convos.length} hint={sel.label} />
        <StatCard label="Avg QC" value={fmtScore(avg)} />
        <StatCard label="To audit" value={toAudit} tone={toAudit ? "red" : "default"} hint="<75" />
        <StatCard
          label="Lowest"
          value={fmtScore(scored.length ? Math.min(...scored.map((c) => c.qc_score as number)) : null)}
        />
      </div>

      <div className="px-6">
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="mb-2 text-sm font-medium">QC score trend</div>
          <ScoreTrendChart data={trend} />
        </div>
      </div>

      <div className="px-6 py-5">
        <div className="mb-2 text-sm font-medium text-neutral-500">
          Conversations (lowest score first — review these)
        </div>
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950">
              <tr>
                <th className="px-4 py-3 font-medium">Subject</th>
                <th className="px-4 py-3 text-center font-medium">CX</th>
                <th className="px-4 py-3 text-center font-medium">QC</th>
                <th className="px-4 py-3 text-center font-medium">Band</th>
                <th className="px-4 py-3 text-center font-medium">Status</th>
                <th className="px-4 py-3 text-center font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {convos.map((c) => (
                <tr key={c.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                  <td className="max-w-md truncate px-4 py-3">
                    <Link href={`/conversations/${c.id}`} className="text-sky-700 hover:underline dark:text-sky-400">
                      {c.subject ?? "(no subject)"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-center"><CxChip cx={c.cx_score} /></td>
                  <td className="px-4 py-3 text-center"><ScoreCell score={c.qc_score} /></td>
                  <td className="px-4 py-3 text-center"><BandChip band={scoreBand(c.qc_score)} /></td>
                  <td className="px-4 py-3 text-center text-xs text-neutral-500">{c.review_status.replace("_", " ")}</td>
                  <td className="px-4 py-3 text-center text-xs text-neutral-500">{formatDate(c.intercom_created_at)}</td>
                </tr>
              ))}
              {convos.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-neutral-500">
                    No scored conversations in {sel.label.toLowerCase()}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
