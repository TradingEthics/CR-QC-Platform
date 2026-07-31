import Link from "next/link";
import { getAgentLeaderboard } from "@/lib/queries";
import { PageHeader, ScoreCell } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const board = await getAgentLeaderboard();
  return (
    <div>
      <PageHeader title="Agents" subtitle="Active Case Resolution agents" />
      <div className="grid grid-cols-1 gap-3 px-6 py-5 sm:grid-cols-2 lg:grid-cols-3">
        {board.map((a) => (
          <Link
            key={a.agent_id}
            href={`/agents/${a.agent_id}`}
            className="rounded-xl border border-neutral-200 bg-white p-4 transition-colors hover:border-sky-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-sky-700"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium">{a.name}</div>
                <div className="text-xs text-neutral-500">{a.email}</div>
              </div>
              <ScoreCell score={a.avg_qc} />
            </div>
            <div className="mt-3 flex gap-4 text-xs text-neutral-500">
              <span>{a.total} scored</span>
              {a.pending_review > 0 && (
                <span className="text-red-600 dark:text-red-400">{a.pending_review} to audit</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
