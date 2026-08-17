// TypeScript interfaces matching the Supabase schema (docs/references/schema.sql).

export type ReviewStatus =
  | "pending_scoring"
  | "auto_approved"
  | "pending_review"
  | "in_review"
  | "reviewed";

export type ErrorSeverity = "critical_fail" | "major" | "significant" | "minor";

export interface Agent {
  id: string;
  intercom_id: string;
  name: string;
  email: string | null;
  is_active: boolean;
}

export interface Inbox {
  id: string;
  intercom_id: string;
  name: string;
}

export interface Conversation {
  id: string;
  intercom_id: string;
  inbox_id: string | null;
  agent_id: string | null;
  cx_score: number | null;
  customer_name: string | null;
  customer_email: string | null;
  subject: string | null;
  qc_score: number | null;
  review_status: ReviewStatus;
  intercom_created_at: string | null;
  admin_reply_count: number;
  intercom_url: string | null;
}

export interface ScoringCategory {
  id: string;
  section: string;
  severity: ErrorSeverity;
  deduction: number;
  error_type: string;
  error_subtype: string | null;
  description: string;
  ai_scoreable: boolean;
}

export interface QcAssessment {
  id: string;
  conversation_id: string;
  total_deductions: number;
  final_score: number;
  provider: string;
  model_name: string | null;
  ai_reasoning: string | null;
  scored_at: string | null;
}

export interface QcError {
  id: string;
  assessment_id: string;
  category_id: string;
  conversation_part_id: string | null;
  severity: ErrorSeverity;
  deduction: number;
  ai_explanation: string | null;
  evidence_quote: string | null;
  is_overridden: boolean;
}

export interface ConversationPart {
  id: string;
  conversation_id: string;
  author_type: "admin" | "bot" | "user";
  author_id: string | null;
  agent_id: string | null;
  body_text: string | null;
  part_type: string | null;
  sequence_order: number;
}

/** Aggregated per-agent leaderboard row. */
export interface AgentSummary {
  agent_id: string;
  name: string;
  email: string | null;
  total: number;
  avg_qc: number | null;
  min_qc: number | null;
  excellent: number;
  good: number;
  average: number;
  fail: number;
  pending_review: number;
  reviewed: number;
}
