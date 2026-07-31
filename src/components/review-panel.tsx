"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, X, Plus, Trash2, ShieldCheck } from "lucide-react";
import { Button, ScoreCell } from "@/components/ui";
import { cn } from "@/lib/utils";
import { saveReview } from "@/app/actions/review";

export interface ReviewAiError {
  id: string;
  subtype: string;
  severity: string;
  deduction: number;
  explanation: string | null;
}
export interface ReviewCategory {
  id: string;
  subtype: string;
  section: string;
  severity: string;
  deduction: number;
}

const SEV_BADGE: Record<string, string> = {
  critical_fail: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  major: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  significant: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  minor: "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
};

export function ReviewPanel({
  conversationId,
  assessmentId,
  originalScore,
  aiErrors,
  categories,
  alreadyReviewed,
}: {
  conversationId: string;
  assessmentId: string | null;
  originalScore: number | null;
  aiErrors: ReviewAiError[];
  categories: ReviewCategory[];
  alreadyReviewed: boolean;
}) {
  const router = useRouter();
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());
  const [added, setAdded] = React.useState<{ categoryId: string; subtype: string; deduction: number; severity: string }[]>([]);
  const [notes, setNotes] = React.useState("");
  const [pick, setPick] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const activeDeduction =
    aiErrors.filter((e) => !dismissed.has(e.id)).reduce((s, e) => s + Number(e.deduction), 0) +
    added.reduce((s, a) => s + Number(a.deduction), 0);
  const finalScore = Math.max(0, 100 - activeDeduction);

  function toggle(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function addPicked() {
    const cat = categories.find((c) => c.id === pick);
    if (!cat) return;
    setAdded((a) => [...a, { categoryId: cat.id, subtype: cat.subtype, deduction: Number(cat.deduction), severity: cat.severity }]);
    setPick("");
  }

  async function complete() {
    setSaving(true);
    try {
      await saveReview({
        conversationId,
        assessmentId,
        originalScore,
        finalScore,
        dismissedErrorIds: [...dismissed],
        addedCategories: added.map((a) => ({ categoryId: a.categoryId, note: "" })),
        notes,
      });
      setSaved(true);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const grouped = categories.reduce<Record<string, ReviewCategory[]>>((acc, c) => {
    (acc[c.section] ??= []).push(c);
    return acc;
  }, {});

  return (
    <div className="rounded-xl glass p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-[var(--primary)]" /> Review Mode
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>AI {originalScore ?? "—"}</span>
          <span>→</span>
          <ScoreCell score={finalScore} />
        </div>
      </div>

      {saved ? (
        <div className="mt-4 rounded-lg bg-emerald-100 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          Review saved — final score {finalScore.toFixed(1)}.
        </div>
      ) : (
        <>
          {/* AI errors: agree / dismiss */}
          <div className="mt-3 space-y-2">
            {aiErrors.length === 0 && (
              <div className="text-xs text-muted-foreground">AI found no errors. Add any it missed below.</div>
            )}
            {aiErrors.map((e) => {
              const off = dismissed.has(e.id);
              return (
                <div key={e.id} className={cn("rounded-lg border border-[var(--border)] p-2.5", off && "opacity-50")}>
                  <div className="flex items-center justify-between gap-2">
                    <div className={cn("text-sm font-medium", off && "line-through")}>{e.subtype}</div>
                    <div className="flex items-center gap-1.5">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", SEV_BADGE[e.severity])}>−{e.deduction}</span>
                      <button
                        onClick={() => toggle(e.id)}
                        className={cn(
                          "grid h-6 w-6 place-items-center rounded-md border border-[var(--border)] transition-colors",
                          off ? "hover:bg-emerald-100 dark:hover:bg-emerald-950" : "hover:bg-red-100 dark:hover:bg-red-950"
                        )}
                        title={off ? "Restore (agree)" : "Dismiss"}
                      >
                        {off ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <X className="h-3.5 w-3.5 text-red-600" />}
                      </button>
                    </div>
                  </div>
                  {e.explanation && <p className="mt-1 text-xs text-muted-foreground">{e.explanation}</p>}
                </div>
              );
            })}
          </div>

          {/* Added errors */}
          {added.length > 0 && (
            <div className="mt-2 space-y-2">
              {added.map((a, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-dashed border-[var(--primary)] p-2.5">
                  <div className="text-sm font-medium">{a.subtype} <span className="text-xs text-muted-foreground">(added)</span></div>
                  <div className="flex items-center gap-1.5">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", SEV_BADGE[a.severity])}>−{a.deduction}</span>
                    <button onClick={() => setAdded((prev) => prev.filter((_, j) => j !== i))} className="grid h-6 w-6 place-items-center rounded-md border border-[var(--border)] hover:bg-muted">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add error */}
          <div className="mt-3 flex gap-2">
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              className="h-9 flex-1 rounded-lg border border-[var(--border)] bg-transparent px-2 text-sm"
            >
              <option value="">Add a missed error…</option>
              {Object.entries(grouped).map(([section, cats]) => (
                <optgroup key={section} label={section}>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.subtype} (−{c.deduction})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <Button variant="subtle" size="icon" onClick={addPicked} disabled={!pick}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Review notes (optional)…"
            className="mt-3 h-20 w-full resize-none rounded-lg border border-[var(--border)] bg-transparent p-2.5 text-sm"
          />

          <Button className="mt-3 w-full" onClick={complete} disabled={saving}>
            {saving ? "Saving…" : `Complete Review · ${finalScore.toFixed(1)}`}
          </Button>
          {alreadyReviewed && (
            <p className="mt-2 text-center text-[11px] text-amber-500">This conversation was already reviewed — saving will overwrite the score.</p>
          )}
        </>
      )}
    </div>
  );
}
