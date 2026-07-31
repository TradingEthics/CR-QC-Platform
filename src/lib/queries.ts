import "server-only";
import { createServerSupabase } from "@/lib/supabase";
import { scoreBand } from "@/lib/utils";
import type {
  Agent,
  AgentSummary,
  Conversation,
  ConversationPart,
  QcAssessment,
  QcError,
  ScoringCategory,
} from "@/lib/types";

/** The active CR agents, keyed on their (stable) email identity. */
export const CR_AGENT_EMAILS = [
  "ukyaching.utsha@nextventures.io",
  "tasnim.hasan@nextventures.io",
  "aqib@nextventures.io",
  "anika.mehjaben@nextventures.io",
  "joshua@nextventures.io",
  "nuzhat.tabassum@nextventures.io",
  "vihagi@nextventures.io",
  "ridah.faisel@nextventures.io",
];

export async function getCrAgents(): Promise<Agent[]> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("agents")
    .select("id, intercom_id, name, email, is_active")
    .in("email", CR_AGENT_EMAILS);
  return (data ?? []) as Agent[];
}

/** Per-agent leaderboard over scored conversations (optionally within a date window). */
export async function getAgentLeaderboard(sinceIso?: string): Promise<AgentSummary[]> {
  const sb = createServerSupabase();
  const agents = await getCrAgents();
  const byId = new Map(agents.map((a) => [a.id, a]));
  const ids = agents.map((a) => a.id);
  if (ids.length === 0) return [];

  let q = sb
    .from("conversations")
    .select("agent_id, qc_score, review_status")
    .in("agent_id", ids)
    .not("qc_score", "is", null);
  if (sinceIso) q = q.gte("intercom_created_at", sinceIso);
  const { data } = await q;

  const rows = (data ?? []) as Pick<
    Conversation,
    "agent_id" | "qc_score" | "review_status"
  >[];

  const summaries = new Map<string, AgentSummary>();
  for (const a of agents) {
    summaries.set(a.id, {
      agent_id: a.id,
      name: a.name,
      email: a.email,
      total: 0,
      avg_qc: null,
      min_qc: null,
      excellent: 0,
      good: 0,
      average: 0,
      fail: 0,
      pending_review: 0,
      reviewed: 0,
    });
  }
  const sums = new Map<string, number>();

  for (const r of rows) {
    if (!r.agent_id) continue;
    const s = summaries.get(r.agent_id);
    if (!s) continue;
    const score = r.qc_score as number;
    s.total += 1;
    sums.set(r.agent_id, (sums.get(r.agent_id) ?? 0) + score);
    s.min_qc = s.min_qc === null ? score : Math.min(s.min_qc, score);
    const band = scoreBand(score);
    if (band === "Excellent") s.excellent += 1;
    else if (band === "Good") s.good += 1;
    else if (band === "Average") s.average += 1;
    else if (band === "Fail") s.fail += 1;
    if (r.review_status === "pending_review") s.pending_review += 1;
    if (r.review_status === "reviewed") s.reviewed += 1;
  }
  for (const s of summaries.values()) {
    if (s.total > 0) s.avg_qc = (sums.get(s.agent_id) ?? 0) / s.total;
  }

  return [...summaries.values()].sort(
    (a, b) => (b.avg_qc ?? -1) - (a.avg_qc ?? -1)
  );
}

export async function getAgent(agentId: string): Promise<Agent | null> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("agents")
    .select("id, intercom_id, name, email, is_active")
    .eq("id", agentId)
    .maybeSingle();
  return (data as Agent) ?? null;
}

/** An agent's scored conversations, newest first, optionally within a window. */
export async function getAgentConversations(
  agentId: string,
  sinceIso?: string
): Promise<Conversation[]> {
  const sb = createServerSupabase();
  let q = sb
    .from("conversations")
    .select(
      "id, intercom_id, inbox_id, agent_id, cx_score, customer_name, subject, qc_score, review_status, intercom_created_at, admin_reply_count, intercom_url"
    )
    .eq("agent_id", agentId)
    .not("qc_score", "is", null);
  if (sinceIso) q = q.gte("intercom_created_at", sinceIso);
  const { data } = await q.order("qc_score", { ascending: true }).limit(500);
  return (data ?? []) as Conversation[];
}

export interface ConversationDetail {
  conversation: Conversation;
  parts: ConversationPart[];
  assessment: QcAssessment | null;
  errors: (QcError & { category: ScoringCategory | null })[];
}

export async function getConversationDetail(
  convId: string
): Promise<ConversationDetail | null> {
  const sb = createServerSupabase();
  const { data: conv } = await sb
    .from("conversations")
    .select(
      "id, intercom_id, inbox_id, agent_id, cx_score, customer_name, customer_email, subject, qc_score, review_status, intercom_created_at, admin_reply_count, intercom_url"
    )
    .eq("id", convId)
    .maybeSingle();
  if (!conv) return null;

  const { data: parts } = await sb
    .from("conversation_parts")
    .select("id, conversation_id, author_type, author_id, agent_id, body_text, sequence_order")
    .eq("conversation_id", convId)
    .order("sequence_order");

  const { data: assessment } = await sb
    .from("qc_assessments")
    .select("id, conversation_id, total_deductions, final_score, provider, model_name, ai_reasoning, scored_at")
    .eq("conversation_id", convId)
    .order("scored_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let errors: (QcError & { category: ScoringCategory | null })[] = [];
  if (assessment) {
    const { data: errs } = await sb
      .from("qc_errors")
      .select(
        "id, assessment_id, category_id, conversation_part_id, severity, deduction, ai_explanation, evidence_quote, is_overridden, scoring_categories(id, section, severity, deduction, error_type, error_subtype, description, ai_scoreable)"
      )
      .eq("assessment_id", (assessment as QcAssessment).id);
    errors = ((errs ?? []) as unknown[]).map((e) => {
      const row = e as QcError & { scoring_categories: ScoringCategory | null };
      return { ...row, category: row.scoring_categories ?? null };
    });
  }

  return {
    conversation: conv as Conversation,
    parts: (parts ?? []) as ConversationPart[],
    assessment: (assessment as QcAssessment) ?? null,
    errors,
  };
}

/** Conversations awaiting manual audit (pending_review), lowest QC first. */
export async function getReviewQueue(): Promise<(Conversation & { agent_name: string | null })[]> {
  const sb = createServerSupabase();
  const agents = await getCrAgents();
  const byId = new Map(agents.map((a) => [a.id, a.name]));
  const ids = agents.map((a) => a.id);
  if (ids.length === 0) return [];
  const { data } = await sb
    .from("conversations")
    .select(
      "id, intercom_id, agent_id, cx_score, subject, qc_score, review_status, intercom_created_at, intercom_url"
    )
    .in("agent_id", ids)
    .eq("review_status", "pending_review")
    .order("qc_score", { ascending: true })
    .limit(200);
  return ((data ?? []) as Conversation[]).map((c) => ({
    ...c,
    agent_name: c.agent_id ? byId.get(c.agent_id) ?? null : null,
  }));
}

/** All active scoring categories (for the manual "add error" picker). */
export async function getScoringCategories(): Promise<ScoringCategory[]> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("scoring_categories")
    .select("id, section, severity, deduction, error_type, error_subtype, description, ai_scoreable")
    .eq("is_active", true)
    .order("sort_order");
  return (data ?? []) as ScoringCategory[];
}

/** Platform-wide distribution for the dashboard header. */
export async function getOverallStats(sinceIso?: string) {
  const sb = createServerSupabase();
  const agents = await getCrAgents();
  const ids = agents.map((a) => a.id);
  let q = sb
    .from("conversations")
    .select("qc_score, review_status")
    .in("agent_id", ids)
    .not("qc_score", "is", null);
  if (sinceIso) q = q.gte("intercom_created_at", sinceIso);
  const { data } = await q;
  const rows = (data ?? []) as { qc_score: number; review_status: string }[];
  const stats = { total: rows.length, excellent: 0, good: 0, average: 0, fail: 0, pending_review: 0, avg: 0 };
  let sum = 0;
  for (const r of rows) {
    sum += r.qc_score;
    const b = scoreBand(r.qc_score);
    if (b === "Excellent") stats.excellent++;
    else if (b === "Good") stats.good++;
    else if (b === "Average") stats.average++;
    else if (b === "Fail") stats.fail++;
    if (r.review_status === "pending_review") stats.pending_review++;
  }
  stats.avg = rows.length ? sum / rows.length : 0;
  return stats;
}
