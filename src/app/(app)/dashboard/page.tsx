import Link from "next/link";
import { auth } from "@/auth";
import { getAgentLeaderboard, getOverallStats } from "@/lib/queries";
import { PageHeader, StatCard, ScoreCell, Card } from "@/components/ui";
import { DateRangeFilter } from "@/components/date-range-filter";
import { RefreshButton } from "@/components/refresh-button";
import { rangeFromSearchParams } from "@/lib/date-range";
import { fmtScore } from "@/lib/utils";

export const dynamic = "force-dynamic";

function Bar({ stats }: { stats: { excellent: number; good: number; average: number; fail: number; total: number } }) {
  const seg = [
    { n: stats.excellent, c: "bg-emerald-500", label: "Excellent" },
    { n: stats.good, c: "bg-sky-500", label: "Good" },
    { n: stats.average, c: "bg-amber-500", label: "Average" },
    { n: stats.fail, c: "bg-red-500", label: "Fail" },
  ];
  const total = stats.total || 1;
  return (
    <Card className="p-4">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Distribution</div>
      <div className="flex h-3 overflow-hidden rounded-full">
        {seg.map((s) => (
          <div key={s.label} className={s.c} style={{ width: `${(s.n / total) * 100}%` }} title={`${s.label}: ${s.n}`} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {seg.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${s.c}`} />
            {s.label} {s.n} ({Math.round((s.n / total) * 100)}%)
          </span>
        ))}
      </div>
    </Card>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ since?: string; until?: string }>;
}) {
  const range = rangeFromSearchParams(await searchParams);
  const [board, stats, session] = await Promise.all([
    getAgentLeaderboard(range),
    getOverallStats(range),
    auth(),
  ]);
  const isAdmin = session?.user?.role === "admin";

  return (
    <div className="pb-10">
      <PageHeader
        title="Dashboard"
        subtitle="Agent QC leaderboard across the 13 CR inboxes"
        right={isAdmin ? <RefreshButton /> : undefined}
      />

      <div className="px-6 pb-1">
        <DateRangeFilter />
      </div>

      <div className="grid grid-cols-2 gap-3 px-6 pt-3 lg:grid-cols-4">
        <StatCard label="Scored" value={stats.total} />
        <StatCard label="Avg QC" value={fmtScore(stats.avg)} />
        <StatCard label="Pass rate" value={`${stats.total ? Math.round(((stats.total - stats.fail) / stats.total) * 100) : 0}%`} tone="emerald" hint="≥75" />
        <StatCard label="To audit" value={stats.fail} tone="red" hint="<75" />
      </div>

      <div className="px-6 pt-3">
        <Bar stats={stats} />
      </div>

      <div className="px-6 pt-5">
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Agent</th>
                <th className="px-4 py-3 text-center font-medium">Convos</th>
                <th className="px-4 py-3 text-center font-medium">Avg QC</th>
                <th className="px-4 py-3 text-center font-medium">Min</th>
                <th className="px-4 py-3 text-center font-medium text-emerald-500">Excl</th>
                <th className="px-4 py-3 text-center font-medium text-sky-500">Good</th>
                <th className="px-4 py-3 text-center font-medium text-amber-500">Avg</th>
                <th className="px-4 py-3 text-center font-medium text-red-500">Fail</th>
                <th className="px-4 py-3 text-center font-medium">Audit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {board.map((a) => (
                <tr key={a.agent_id} className="transition-colors hover:bg-[var(--muted)]/40">
                  <td className="px-4 py-3">
                    <Link href={`/agents/${a.agent_id}`} className="font-medium text-[var(--primary)] hover:underline">
                      {a.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{a.email}</div>
                  </td>
                  <td className="px-4 py-3 text-center">{a.total}</td>
                  <td className="px-4 py-3 text-center"><ScoreCell score={a.avg_qc} /></td>
                  <td className="px-4 py-3 text-center text-muted-foreground">{fmtScore(a.min_qc)}</td>
                  <td className="px-4 py-3 text-center">{a.excellent}</td>
                  <td className="px-4 py-3 text-center">{a.good}</td>
                  <td className="px-4 py-3 text-center">{a.average}</td>
                  <td className="px-4 py-3 text-center">{a.fail}</td>
                  <td className="px-4 py-3 text-center">
                    {a.pending_review > 0 ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
                        {a.pending_review}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                </tr>
              ))}
              {board.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                    No scored conversations yet.
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
