import Link from "next/link";
import { getReviewQueue } from "@/lib/queries";
import { PageHeader, ScoreCell, CxChip, Card } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const queue = await getReviewQueue();
  return (
    <div className="pb-10">
      <PageHeader
        title="Review Queue"
        subtitle={`${queue.length} conversation${queue.length === 1 ? "" : "s"} below 75 — manual audit`}
      />
      <div className="px-6">
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Subject</th>
                <th className="px-4 py-3 font-medium">Agent</th>
                <th className="px-4 py-3 text-center font-medium">CX</th>
                <th className="px-4 py-3 text-center font-medium">QC</th>
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
                  <td className="px-4 py-3 text-center text-xs text-muted-foreground">{formatDate(c.intercom_created_at)}</td>
                </tr>
              ))}
              {queue.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    Nothing awaiting review.
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
