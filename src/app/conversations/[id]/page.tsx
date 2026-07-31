import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { getConversationDetail, getScoringCategories } from "@/lib/queries";
import { PageHeader, ScoreCell, CxChip, Card, Button } from "@/components/ui";
import { ReviewPanel } from "@/components/review-panel";
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
  const [detail, categories] = await Promise.all([getConversationDetail(id), getScoringCategories()]);
  if (!detail) notFound();
  const { conversation: c, parts, assessment, errors } = detail;

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
                      {isAgent ? "Agent" : isBot ? "Bot / Fin AI" : "Customer"} · #{p.sequence_order}
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
            {assessment?.ai_reasoning && (
              <p className="mt-3 text-sm text-muted-foreground">{assessment.ai_reasoning}</p>
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
        </div>
      </div>
    </div>
  );
}
