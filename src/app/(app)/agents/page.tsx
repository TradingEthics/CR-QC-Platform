import { getAgentLeaderboard } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { AgentsGrid } from "@/components/agents-grid";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const board = await getAgentLeaderboard();
  return (
    <div className="pb-10">
      <PageHeader title="Agents" subtitle="Active Case Resolution agents" />
      <AgentsGrid board={board} />
    </div>
  );
}
