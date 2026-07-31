import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { getConversationDetail } from "@/lib/queries";
import { PageHeader, ScoreCell, CxChip } from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const SEVERITY_LABEL: Record<string, string> = {
  critical_fail: "Critical Fail −50",
  major: "Major −20",
  significant: "Significant −15",
  minor: "Minor −7.5",
};

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getConversationDetail(id);
  if (!detail) notFound();
  const { conversation: c, parts, assessment, errors } = detail;

  return (
    <div>
      <PageHeader
        title={c.subject ?? "Conversation"}
        subtitle={`${c.customer_name ?? "Customer"} · ${formatDate(c.intercom_created_at)}`}
        right={
          c.intercom_url ? (
            <a
              href={c.intercom_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium hover:bg-neutral-100 dark:border-neutral-800 dark:hover:bg-neutral-800"
            >
              Open in Intercom <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : undefined
        }
      />

      <div className="grid gap-6 px-6 py-5 lg:grid-cols-[1fr_360px]">
        {/* Thread */}
        <div className="space-y-3">
          {parts
            .filter((p) => (p.body_text ?? "").trim())
            .map((p) => {
              const isAgent = p.author_type === "admin";
              const isBot = p.author_type === "bot";
              return (
                <div
                  key={p.id}
                  className={cn("flex", isAgent ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm",
                      isAgent
                        ? "bg-sky-600 text-white"
                        : isBot
                          ? "bg-neutral-100 text-neutral-500 dark:bg-neutral-800"
                          : "bg-white text-neutral-800 ring-1 ring-neutral-200 dark:bg-neutral-900 dark:text-neutral-200 dark:ring-neutral-800"
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
        </div>

        {/* Assessment panel */}
        <div className="space-y-4">
          <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">AI QC Assessment</div>
              <ScoreCell score={c.qc_score} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-500">
              <span>CX <CxChip cx={c.cx_score} /></span>
              <span>· {c.review_status.replace("_", " ")}</span>
              {assessment?.model_name && <span>· {assessment.model_name}</span>}
            </div>
            {assessment?.ai_reasoning && (
              <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
                {assessment.ai_reasoning}
              </p>
            )}
          </div>

          <div>
            <div className="mb-2 text-sm font-medium text-neutral-500">
              Errors detected ({errors.length})
            </div>
            <div className="space-y-2">
              {errors.map((e) => (
                <div
                  key={e.id}
                  className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">
                      {e.category?.error_subtype ?? "Error"}
                    </div>
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
                      {SEVERITY_LABEL[e.severity] ?? e.severity} · −{e.deduction}
                    </span>
                  </div>
                  {e.ai_explanation && (
                    <p className="mt-1.5 text-xs text-neutral-600 dark:text-neutral-400">{e.ai_explanation}</p>
                  )}
                  {e.evidence_quote && (
                    <blockquote className="mt-2 border-l-2 border-neutral-300 pl-2 text-xs italic text-neutral-500 dark:border-neutral-700">
                      “{e.evidence_quote}”
                    </blockquote>
                  )}
                </div>
              ))}
              {errors.length === 0 && (
                <div className="rounded-xl border border-dashed border-neutral-200 p-4 text-center text-sm text-neutral-400 dark:border-neutral-800">
                  No errors — clean conversation.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
