import Link from "next/link";
import { getAgentLeaderboard, getOverallStats } from "@/lib/queries";
import { PageHeader, StatCard, ScoreCell } from "@/components/ui";
import { fmtScore } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [board, stats] = await Promise.all([
    getAgentLeaderboard(),
    getOverallStats(),
  ]);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Agent QC leaderboard across the 13 CR inboxes"
      />

      <div className="grid grid-cols-2 gap-3 px-6 py-5 lg:grid-cols-6">
        <StatCard label="Scored" value={stats.total} />
        <StatCard label="Avg QC" value={fmtScore(stats.avg)} />
        <StatCard label="Excellent" value={stats.excellent} tone="emerald" hint="≥90" />
        <StatCard label="Good" value={stats.good} hint="80–89" />
        <StatCard label="Average" value={stats.average} tone="amber" hint="75–79" />
        <StatCard label="Fail → audit" value={stats.fail} tone="red" hint="<75" />
      </div>

      <div className="px-6 pb-10">
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950">
              <tr>
                <th className="px-4 py-3 font-medium">Agent</th>
                <th className="px-4 py-3 text-center font-medium">Convos</th>
                <th className="px-4 py-3 text-center font-medium">Avg QC</th>
                <th className="px-4 py-3 text-center font-medium">Min</th>
                <th className="px-4 py-3 text-center font-medium text-emerald-600">Excellent</th>
                <th className="px-4 py-3 text-center font-medium text-sky-600">Good</th>
                <th className="px-4 py-3 text-center font-medium text-amber-600">Average</th>
                <th className="px-4 py-3 text-center font-medium text-red-600">Fail</th>
                <th className="px-4 py-3 text-center font-medium">To audit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {board.map((a) => (
                <tr key={a.agent_id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                  <td className="px-4 py-3">
                    <Link href={`/agents/${a.agent_id}`} className="font-medium text-sky-700 hover:underline dark:text-sky-400">
                      {a.name}
                    </Link>
                    <div className="text-xs text-neutral-500">{a.email}</div>
                  </td>
                  <td className="px-4 py-3 text-center">{a.total}</td>
                  <td className="px-4 py-3 text-center"><ScoreCell score={a.avg_qc} /></td>
                  <td className="px-4 py-3 text-center text-neutral-500">{fmtScore(a.min_qc)}</td>
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
                      <span className="text-neutral-400">0</span>
                    )}
                  </td>
                </tr>
              ))}
              {board.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-neutral-500">
                    No scored conversations yet.
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
