import Link from "next/link";
import { getAgentLeaderboard } from "@/lib/queries";
import { PageHeader, ScoreCell, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const board = await getAgentLeaderboard();
  return (
    <div className="pb-10">
      <PageHeader title="Agents" subtitle="Active Case Resolution agents" />
      <div className="grid grid-cols-1 gap-3 px-6 sm:grid-cols-2 lg:grid-cols-3">
        {board.map((a) => (
          <Link key={a.agent_id} href={`/agents/${a.agent_id}`}>
            <Card className="p-4 transition-transform hover:-translate-y-0.5">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="truncate font-medium">{a.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{a.email}</div>
                </div>
                <ScoreCell score={a.avg_qc} />
              </div>
              <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                <span>{a.total} scored</span>
                {a.pending_review > 0 && (
                  <span className="text-red-500">{a.pending_review} to audit</span>
                )}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
