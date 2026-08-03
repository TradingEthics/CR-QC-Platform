// Refresh orchestrator: incremental Intercom ingest + CX-scoped AI scoring.
// Shared by the Vercel cron route and the in-app admin "Fetch" button.
// Gemini free tier first; auto-switches to DeepSeek (OpenRouter) when Gemini's
// daily quota is exhausted. Honors a soft time budget for the 60s Vercel limit.
import "server-only";
import { createServerSupabase } from "@/lib/supabase";
import { IntercomClient } from "./intercom";
import { upsertAgents, upsertInboxes, upsertConversation } from "./ingest";
import {
  type Category,
  type AiError,
  buildSystemPrompt,
  buildResponseSchema,
  buildConversationText,
  buildUserPrompt,
  computeAssessment,
  routeStatus,
  scoreGemini,
  scoreOpenRouter,
  GeminiQuotaError,
} from "./scoring";

export interface RefreshOptions {
  ingest?: boolean;       // default true
  sinceHours?: number;    // incremental lookback window (default 48)
  maxIngest?: number;     // cap conversations fetched per run (default 80)
  scoreLimit?: number;    // cap conversations scored per run (default 12)
  budgetMs?: number;      // soft wall-clock budget (default 50s)
}

export interface RefreshResult {
  ingested: number;
  skippedNoHuman: number;
  scored: number;
  failed: number;
  geminiUsed: number;
  deepseekUsed: number;
  remainingToScore: number;
  errors: string[];
  startedAt: string;
}

function env(name: string): string {
  return process.env[name] ?? "";
}

export async function runRefresh(opts: RefreshOptions = {}): Promise<RefreshResult> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const budgetMs = opts.budgetMs ?? 45_000; // stay under Vercel's 60s cap
  const doIngest = opts.ingest !== false;
  const sinceHours = opts.sinceHours ?? 48;
  const maxIngest = opts.maxIngest ?? 80;
  const scoreLimit = opts.scoreLimit ?? 12;

  const sb = createServerSupabase();
  const result: RefreshResult = {
    ingested: 0,
    skippedNoHuman: 0,
    scored: 0,
    failed: 0,
    geminiUsed: 0,
    deepseekUsed: 0,
    remainingToScore: 0,
    errors: [],
    startedAt,
  };

  // ---------------- Phase 1: Ingest ----------------
  const intercomToken = env("INTERCOM_API_TOKEN");
  if (doIngest && intercomToken) {
    try {
      const client = new IntercomClient(
        intercomToken,
        env("INTERCOM_API_VERSION") || "2.11",
        env("INTERCOM_APP_ID")
      );
      const admins = await client.listAdmins();
      const botIds = new Set(
        admins.filter((a) => a.email && a.email.includes("@intercom.io")).map((a) => a.id)
      );
      const agentCache = await upsertAgents(sb, admins);
      const teams = await client.listTeams();
      const inboxCache = await upsertInboxes(sb, teams);

      const crIds = (env("CR_INBOX_IDS") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const inboxes = crIds.length ? teams.filter((t) => crIds.includes(t.id)) : teams;
      const since = new Date(Date.now() - sinceHours * 3600_000);
      // Reserve ~60% of the budget for ingest so scoring still runs.
      const ingestDeadline = t0 + budgetMs * 0.6;
      const maxPagesPerInbox = 6; // bound pagination for incremental windows

      // Process page-by-page so maxIngest / the time budget bound work correctly,
      // instead of fully paginating every inbox up front.
      outer: for (const inbox of inboxes) {
        let cursor: string | undefined;
        for (let page = 0; page < maxPagesPerInbox; page++) {
          if (result.ingested >= maxIngest || Date.now() > ingestDeadline) break outer;
          const { conversations, nextCursor } = await client.searchConversationsPage(
            inbox.id,
            since,
            cursor
          );
          for (const rc of conversations) {
            if (result.ingested >= maxIngest || Date.now() > ingestDeadline) break outer;
            try {
              const full = await client.getConversation(String(rc.id));
              const parsed = client.parseConversation(full, botIds);
              if (parsed.admin_reply_count === 0) {
                result.skippedNoHuman++;
                continue;
              }
              const uuid = await upsertConversation(sb, parsed, agentCache, inboxCache);
              if (uuid) result.ingested++;
            } catch (e) {
              result.errors.push(`ingest ${rc.id}: ${e instanceof Error ? e.message : e}`);
            }
          }
          cursor = nextCursor;
          if (!cursor || conversations.length === 0) break; // inbox drained
        }
      }
    } catch (e) {
      result.errors.push(`ingest phase: ${e instanceof Error ? e.message : e}`);
    }
  }

  // ---------------- Phase 2: Score ----------------
  const geminiKey = env("GEMINI_API_KEY");
  const geminiModel = env("GEMINI_MODEL") || "gemini-3.6-flash";
  const orKey = env("OPENROUTER_API_KEY");
  const orModel = env("OPENROUTER_MODEL") || "deepseek/deepseek-v4-flash";
  const forced = (env("SCORING_PROVIDER") || "gemini").toLowerCase();

  // Load AI-scoreable categories.
  const { data: catData } = await sb
    .from("scoring_categories")
    .select("id, section, severity, deduction, error_type, error_subtype, description, ai_scoreable, sort_order")
    .eq("is_active", true)
    .eq("ai_scoreable", true)
    .order("sort_order");
  const categories = (catData ?? []) as Category[];
  const catBySubtype = new Map<string, Category>();
  for (const c of categories) catBySubtype.set((c.error_subtype ?? c.error_type).trim(), c);
  const systemPrompt = buildSystemPrompt(categories);
  const schema = buildResponseSchema(categories);

  // Agent names for thread labels.
  const { data: agentRows } = await sb.from("agents").select("id, name");
  const agentNameById = new Map<string, string>();
  for (const a of agentRows ?? []) agentNameById.set(a.id as string, a.name as string);

  // Fetch unscored, CX-scoped conversations with a human reply.
  const { data: toScore } = await sb
    .from("conversations")
    .select("id, intercom_id, cx_score, subject")
    .eq("review_status", "pending_scoring")
    .gt("admin_reply_count", 0)
    .or("cx_score.is.null,cx_score.lte.2")
    .order("intercom_created_at", { ascending: true })
    .limit(scoreLimit);

  const canGemini = geminiKey && forced !== "openrouter";
  const canDeepseek = Boolean(orKey);
  let geminiExhausted = !canGemini;

  for (const conv of toScore ?? []) {
    if (Date.now() - t0 > budgetMs) break;
    try {
      const { data: parts } = await sb
        .from("conversation_parts")
        .select("id, author_type, author_id, body_text, sequence_order")
        .eq("conversation_id", conv.id as string)
        .order("sequence_order");
      const partsArr = (parts ?? []) as {
        id: string;
        author_type: "admin" | "bot" | "user";
        author_id: string | null;
        body_text: string | null;
        sequence_order: number;
      }[];
      const partIdBySeq = new Map<number, string>();
      for (const p of partsArr) partIdBySeq.set(p.sequence_order, p.id);

      const thread = buildConversationText(
        partsArr.map((p) => ({
          author_type: p.author_type,
          author_id: p.author_id,
          body_text: p.body_text,
          sequence_order: p.sequence_order,
        })),
        agentNameById
      );
      const userPrompt = buildUserPrompt(thread, conv.subject as string | null);

      // Provider selection: Gemini first; on ANY Gemini error fall back to
      // DeepSeek for this conversation. A true quota (429) also stops further
      // Gemini attempts for the rest of the run.
      let scoreRes;
      if (!geminiExhausted) {
        try {
          scoreRes = await scoreGemini(geminiModel, geminiKey, systemPrompt, schema, userPrompt);
          result.geminiUsed++;
        } catch (e) {
          if (!canDeepseek) throw e;
          if (e instanceof GeminiQuotaError) geminiExhausted = true;
          scoreRes = await scoreOpenRouter(orModel, orKey, systemPrompt, schema, userPrompt);
          result.deepseekUsed++;
        }
      } else if (canDeepseek) {
        scoreRes = await scoreOpenRouter(orModel, orKey, systemPrompt, schema, userPrompt);
        result.deepseekUsed++;
      } else {
        throw new Error("No scoring provider available");
      }

      const payload = scoreRes.payload;
      const assessment = computeAssessment(
        (payload.errors ?? []) as AiError[],
        catBySubtype,
        partsArr,
        partIdBySeq
      );

      // Persist assessment + errors, then update the conversation.
      const { data: aRow, error: aErr } = await sb
        .from("qc_assessments")
        .insert({
          conversation_id: conv.id,
          total_deductions: assessment.total_deductions,
          final_score: assessment.final_score,
          provider: scoreRes.provider,
          model_name: scoreRes.model,
          ai_reasoning: payload.overall_reasoning ?? "",
        })
        .select("id")
        .single();
      if (aErr || !aRow) throw new Error(`persist assessment: ${aErr?.message}`);
      if (assessment.error_rows.length) {
        const { error: eErr } = await sb
          .from("qc_errors")
          .insert(assessment.error_rows.map((r) => ({ ...r, assessment_id: aRow.id })));
        if (eErr) throw new Error(`persist errors: ${eErr.message}`);
      }
      const status = routeStatus(assessment.final_score, (conv.cx_score as number | null) ?? null);
      await sb
        .from("conversations")
        .update({ qc_score: assessment.final_score, review_status: status })
        .eq("id", conv.id);

      result.scored++;
    } catch (e) {
      result.failed++;
      result.errors.push(`score ${conv.intercom_id}: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Remaining backlog (for the button's loop / reporting).
  const { count } = await sb
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("review_status", "pending_scoring")
    .gt("admin_reply_count", 0)
    .or("cx_score.is.null,cx_score.lte.2");
  result.remainingToScore = count ?? 0;

  return result;
}
