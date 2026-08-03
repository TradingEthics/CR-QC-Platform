// AI scoring (TypeScript port of docs/references/scoring_prompt.py + scoring_worker.py).
// The model ONLY detects errors + names the category; the score is computed
// deterministically here (final = max(0, 100 - Σ deductions), one per category).
import "server-only";
import { KNOWLEDGE_BASE } from "./knowledge-base";
import type { ParsedPart } from "./intercom";

export const PASS_MARK = 75;

export interface Category {
  id: string;
  section: string;
  severity: string;
  deduction: number;
  error_type: string;
  error_subtype: string | null;
  description: string;
  ai_scoreable: boolean;
}

export interface AiError {
  category?: string;
  agent_reply_seq?: number;
  evidence_quote?: string;
  explanation?: string;
}

export interface ErrorRow {
  category_id: string;
  conversation_part_id: string | null;
  severity: string;
  deduction: number;
  ai_explanation: string;
  evidence_quote: string;
}

export interface Assessment {
  total_deductions: number;
  final_score: number;
  error_rows: ErrorRow[];
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(n));

const SYSTEM_HEADER = `You are a senior Quality Control auditor for FundedNext's Case Resolution (CR) email support team. You grade the QUALITY of the human support agent's replies in a customer conversation against a fixed QC scorecard.

CONTEXT YOU WILL RECEIVE
- A conversation thread. Each message is labeled by author:
    [CUSTOMER]      the client. Read for context only — never graded.
    [BOT / FIN AI]  automated replies. Read for context only — never graded.
    [AGENT: name #seq]  a HUMAN agent reply. THIS is what you grade.
- Only [AGENT] messages are subject to QC. Judge the agent's replies given the
  customer's messages as context.

HOW TO GRADE
- Go through the scorecard below. Flag an error ONLY when the agent's reply
  clearly meets a category's definition. When unsure, do NOT flag — false
  positives are worse than misses here.
- For every error you flag, return: category (exact name from the allowed list),
  agent_reply_seq (the #seq of the agent reply), evidence_quote (exact text), and
  explanation (one concise sentence).
- Do NOT calculate any score or deduction. You only identify errors.
- Flag each distinct category at most once per conversation, even if it recurs.
  If a category recurs, note it in the explanation (e.g., "3 instances").
- If the agent replies are clean, return an empty errors list.

SPECIAL RULE — Incorrect Information:
- Only flag "Incorrect Information" when the agent's statement CLEARLY contradicts
  a rule in the KNOWLEDGE BASE below. If the base is silent or the wording is a
  reasonable paraphrase, DO NOT flag. Never flag it from your own assumptions.

SCORECARD (severity shown for your judgment; you do not apply the points):`;

const SYSTEM_FOOTER =
  "\nReturn ONLY the structured JSON defined by the response schema. No prose outside it.";

export function buildSystemPrompt(categories: Category[], kb = KNOWLEDGE_BASE): string {
  const tiers = new Map<string, Category[]>();
  for (const c of categories) {
    if (!tiers.has(c.section)) tiers.set(c.section, []);
    tiers.get(c.section)!.push(c);
  }
  const lines: string[] = [SYSTEM_HEADER];
  for (const [section, cats] of tiers) {
    lines.push(`\n=== ${section} (−${fmt(cats[0].deduction)} points each) ===`);
    for (const c of cats) {
      const name = c.error_subtype ?? c.error_type;
      lines.push(`\n• ${name}`);
      if (c.error_type && c.error_type !== name) lines.push(`  (type: ${c.error_type})`);
      lines.push(`  ${c.description.trim()}`);
    }
  }
  if (kb) {
    lines.push("\n\n" + "=".repeat(60));
    lines.push("KNOWLEDGE BASE — FundedNext rules (ground truth for Incorrect Information)");
    lines.push("=".repeat(60));
    lines.push(kb);
  }
  lines.push(SYSTEM_FOOTER);
  return lines.join("\n");
}

export function buildResponseSchema(categories: Category[]) {
  const allowed = categories.map((c) => c.error_subtype ?? c.error_type);
  return {
    type: "object",
    properties: {
      errors: {
        type: "array",
        description: "Every QC error found in the agent's replies. Empty if none.",
        items: {
          type: "object",
          properties: {
            category: { type: "string", enum: allowed, description: "Exact scorecard category name." },
            agent_reply_seq: { type: "integer", description: "The #seq of the agent reply containing the error." },
            evidence_quote: { type: "string", description: "Exact text from the agent reply demonstrating the error." },
            explanation: { type: "string", description: "One concise sentence on why it violates the category." },
          },
          required: ["category", "evidence_quote", "explanation"],
        },
      },
      overall_reasoning: { type: "string", description: "Brief overall summary of the agent's performance." },
    },
    required: ["errors", "overall_reasoning"],
  };
}

export function buildConversationText(
  parts: {
    author_type: ParsedPart["author_type"];
    author_id: string | null;
    body_text: string | null;
    sequence_order: number;
  }[],
  agentNameById: Map<string, string>
): string {
  const ordered = [...parts].sort((a, b) => a.sequence_order - b.sequence_order);
  const out: string[] = [];
  for (const p of ordered) {
    const body = (p.body_text ?? "").trim();
    if (!body) continue;
    let label: string;
    if (p.author_type === "user") label = "[CUSTOMER]";
    else if (p.author_type === "bot") label = "[BOT / FIN AI]";
    else {
      const name = (p.author_id && agentNameById.get(p.author_id)) || "Agent";
      label = `[AGENT: ${name} #${p.sequence_order}]`;
    }
    out.push(`${label}\n${body}`);
  }
  return out.join("\n\n");
}

export function buildUserPrompt(conversationText: string, subject?: string | null): string {
  let header = "Grade the AGENT replies in the following CR support conversation.";
  if (subject) header += `\nConversation subject: "${subject}"`;
  return `${header}\n\n--- CONVERSATION START ---\n\n${conversationText}\n\n--- CONVERSATION END ---`;
}

export function computeAssessment(
  aiErrors: AiError[],
  catBySubtype: Map<string, Category>,
  parts: Pick<ParsedPart, "sequence_order">[],
  partIdBySeq: Map<number, string>
): Assessment {
  const byCategory = new Map<string, { cat: Category; instances: AiError[] }>();
  for (const err of aiErrors) {
    const subtype = (err.category ?? "").trim();
    const cat = catBySubtype.get(subtype);
    if (!cat) continue;
    if (!byCategory.has(subtype)) byCategory.set(subtype, { cat, instances: [] });
    byCategory.get(subtype)!.instances.push(err);
  }
  const error_rows: ErrorRow[] = [];
  let total = 0;
  for (const { cat, instances } of byCategory.values()) {
    const first = instances[0];
    const deduction = Number(cat.deduction);
    total += deduction;
    let note = first.explanation ?? "";
    if (instances.length > 1) note = `${note} (${instances.length} instances flagged)`;
    const seq = first.agent_reply_seq;
    const partId = seq != null ? partIdBySeq.get(seq) ?? null : null;
    error_rows.push({
      category_id: cat.id,
      conversation_part_id: partId,
      severity: cat.severity,
      deduction,
      ai_explanation: note,
      evidence_quote: first.evidence_quote ?? "",
    });
  }
  const final_score = Math.max(0, 100 - total);
  return {
    total_deductions: Math.round(total * 100) / 100,
    final_score: Math.round(final_score * 100) / 100,
    error_rows,
  };
}

export function routeStatus(finalScore: number, cx: number | null): string {
  if (finalScore < PASS_MARK) return "pending_review";
  if (cx !== null && cx <= 2) return "pending_review";
  return "auto_approved";
}

// --- Provider calls -------------------------------------------------

/** Thrown when Gemini's free-tier daily quota is exhausted → switch to DeepSeek. */
export class GeminiQuotaError extends Error {}

export interface ScoreResult {
  payload: { errors?: AiError[]; overall_reasoning?: string };
  provider: string;
  model: string;
}

function stripFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    const nl = t.indexOf("\n");
    t = nl >= 0 ? t.slice(nl + 1) : t.slice(3);
    if (t.trimEnd().endsWith("```")) t = t.trimEnd().slice(0, -3);
  }
  return t.trim();
}

const schemaSuffix = (schema: unknown) =>
  "\n\nRespond with ONLY a JSON object (no prose, no code fences) matching exactly this JSON schema:\n" +
  JSON.stringify(schema);

export async function scoreGemini(
  model: string,
  apiKey: string,
  system: string,
  schema: unknown,
  user: string
): Promise<ScoreResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system + schemaSuffix(schema) }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0 },
    }),
  });
  if (res.status === 429) throw new GeminiQuotaError("Gemini daily quota exhausted");
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as Record<string, unknown>;
  const candidates = (data.candidates as Record<string, unknown>[]) ?? [];
  const content = (candidates[0]?.content as Record<string, unknown>) ?? {};
  const parts = (content.parts as Record<string, unknown>[]) ?? [];
  const text = (parts[0]?.text as string) ?? "{}";
  return { payload: JSON.parse(stripFences(text)), provider: "gemini", model };
}

export async function scoreOpenRouter(
  model: string,
  apiKey: string,
  system: string,
  schema: unknown,
  user: string,
  attempt = 0
): Promise<ScoreResult> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system + schemaSuffix(schema) },
        { role: "user", content: user },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    }),
  });
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 3000));
    return scoreOpenRouter(model, apiKey, system, schema, user, attempt + 1);
  }
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as Record<string, unknown>;
  const choices = (data.choices as Record<string, unknown>[]) ?? [];
  const msg = (choices[0]?.message as Record<string, unknown>) ?? {};
  const content = (msg.content as string) ?? "{}";
  return { payload: JSON.parse(stripFences(content)), provider: "openrouter", model };
}
