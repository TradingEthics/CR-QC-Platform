"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase";
import { auth, authConfigured } from "@/auth";
import { canAudit, DEFAULT_ROLE } from "@/lib/rbac";

export interface SaveReviewInput {
  conversationId: string;
  assessmentId: string | null;
  originalScore: number | null;
  finalScore: number;
  dismissedErrorIds: string[]; // AI qc_errors the reviewer dismissed
  addedCategories: { categoryId: string; note: string }[]; // errors the reviewer added
  notes: string;
  reviewerName?: string;
  reviewerEmail?: string;
}

/** Persist a manual review: records the audit, marks dismissed AI errors,
 *  and writes the final human-adjusted score onto the conversation. */
export async function saveReview(input: SaveReviewInput) {
  // Only reviewers/admins may write audits.
  if (authConfigured) {
    const session = await auth();
    if (!canAudit(session?.user?.role ?? DEFAULT_ROLE)) {
      return { ok: false, error: "Not authorized to submit reviews." as string };
    }
  }
  const sb = createServerSupabase();
  const now = new Date().toISOString();

  // 1. Manual review record (audit trail).
  await sb.from("manual_reviews").insert({
    conversation_id: input.conversationId,
    assessment_id: input.assessmentId,
    reviewer_name: input.reviewerName ?? "QC Reviewer",
    reviewer_email: input.reviewerEmail ?? null,
    original_qc_score: input.originalScore,
    final_qc_score: input.finalScore,
    review_notes: input.notes,
    errors_added: input.addedCategories,
    errors_removed: input.dismissedErrorIds,
    claimed_at: now,
    completed_at: now,
  });

  // 2. Flag dismissed AI errors as overridden (keep them for history).
  if (input.dismissedErrorIds.length > 0) {
    await sb
      .from("qc_errors")
      .update({ is_overridden: true, override_reason: "Dismissed in manual review", overridden_at: now })
      .in("id", input.dismissedErrorIds);
  }

  // 3. Final score + status onto the conversation.
  await sb
    .from("conversations")
    .update({ qc_score: input.finalScore, review_status: "reviewed" })
    .eq("id", input.conversationId);

  revalidatePath(`/conversations/${input.conversationId}`);
  revalidatePath("/review");
  revalidatePath("/dashboard");
  return { ok: true, finalScore: input.finalScore };
}
