import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { auth } from "@/auth";
import { getConversationDetail, getScoringCategories } from "@/lib/queries";
import { PageHeader, ScoreCell, CxChip, Card, Button } from "@/components/ui";
import { ReviewPanel } from "@/components/review-panel";
import { canAudit, DEFAULT_ROLE } from "@/lib/rbac";
import { cn, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const SEVERITY_LABEL: Record<string, string> = {
  critical_fail: "Critical Fail −50",
  major: "Major −20",
  significant: "Significant −15",
  minor: "Minor −7.5",
};

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, categories, session] = await Promise.all([
    getConversationDetail(id),
    getScoringCategories(),
    auth(),
  ]);
  if (!detail) notFound();
  const { conversation: c, parts, assessment, errors, agentNames } = detail;
  const mayAudit = canAudit(session?.user?.role ?? DEFAULT_ROLE);

  // Split the AI reasoning into bullet points for display.
  const reasoningBullets = (assessment?.ai_reasoning ?? "")
    .split(/\n+|(?<=\.)\s+(?=[A-Z(])/)
    .map((s) => s.replace(/^[-•\s]+/, "").trim())
    .filter((s) => s.length > 1);

  return (
    <div className="pb-10">
      <PageHeader
        title={c.subject ?? "Conversation"}
        subtitle={`${c.customer_name ?? "Customer"} · ${formatDate(c.intercom_created_at)}`}
        right={
          c.intercom_url ? (
            <a href={c.intercom_url} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm">
                Open in Intercom <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </a>
          ) : undefined
        }
      />

      <div className="grid gap-5 px-6 lg:grid-cols-[1fr_380px]">
        {/* Thread */}
        <Card className="space-y-3 p-4">
          {parts
            .filter((p) => (p.body_text ?? "").trim())
            .map((p) => {
              const isAgent = p.author_type === "admin";
              const isBot = p.author_type === "bot";
              return (
                <div key={p.id} className={cn("flex", isAgent ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm",
                      isAgent
                        ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                        : isBot
                          ? "bg-[var(--muted)] text-muted-foreground"
                          : "bg-white text-neutral-800 ring-1 ring-[var(--border)] dark:bg-neutral-900 dark:text-neutral-200"
                    )}
                  >
                    <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-70">
                      {isAgent
                        ? (p.agent_id && agentNames[p.agent_id]) || "Agent"
                        : isBot
                          ? "Bot / Fin AI"
                          : c.customer_name ?? "Customer"} · #{p.sequence_order}
                    </div>
                    {p.body_text}
                  </div>
                </div>
              );
            })}
        </Card>

        {/* Right column: assessment + review */}
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">AI QC Assessment</div>
              <ScoreCell score={c.qc_score} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <CxChip cx={c.cx_score} />
              <span>· {c.review_status.replace("_", " ")}</span>
              {assessment?.model_name && <span>· {assessment.model_name}</span>}
            </div>
            {reasoningBullets.length > 0 && (
              <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                {reasoningBullets.map((b, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-current opacity-60" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 space-y-2">
              {errors.map((e) => (
                <div key={e.id} className="rounded-lg border border-[var(--border)] p-2.5">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{e.category?.error_subtype ?? "Error"}</div>
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
                      {SEVERITY_LABEL[e.severity] ?? e.severity}
                    </span>
                  </div>
                  {e.ai_explanation && <p className="mt-1.5 text-xs text-muted-foreground">{e.ai_explanation}</p>}
                  {e.evidence_quote && (
                    <blockquote className="mt-2 border-l-2 border-[var(--border-strong)] pl-2 text-xs italic text-muted-foreground">
                      “{e.evidence_quote}”
                    </blockquote>
                  )}
                </div>
              ))}
              {errors.length === 0 && (
                <div className="rounded-lg border border-dashed border-[var(--border)] p-3 text-center text-sm text-muted-foreground">
                  No errors — clean conversation.
                </div>
              )}
            </div>
          </Card>

          {mayAudit && (
            <ReviewPanel
              conversationId={c.id}
              assessmentId={assessment?.id ?? null}
              originalScore={c.qc_score}
              alreadyReviewed={c.review_status === "reviewed"}
              aiErrors={errors.map((e) => ({
                id: e.id,
                subtype: e.category?.error_subtype ?? "Error",
                severity: e.severity,
                deduction: Number(e.deduction),
                explanation: e.ai_explanation,
              }))}
              categories={categories.map((c) => ({
                id: c.id,
                subtype: c.error_subtype ?? c.error_type,
                section: c.section,
                severity: c.severity,
                deduction: Number(c.deduction),
              }))}
            />
          )}
        </div>
      </div>
    </div>
  );
}
