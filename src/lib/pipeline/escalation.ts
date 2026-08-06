// Embedding-based detection for the two "escalation" QC categories the LLM
// can't reliably judge from a single thread:
//
//  • Neglected Escalation History Verification — the customer got essentially
//    the SAME response from MULTIPLE different agents (history wasn't checked).
//    Detected by high cross-agent cosine similarity between agent replies.
//
//  • Incorrect Escalation Channel/Team Assignment — the agent's response does
//    not match the customer's context/topic. Detected by LOW similarity between
//    the customer's messages and every agent reply. Noisier, so gated off by
//    default (ESCALATION_MISMATCH_ENABLED=true to turn on).
import "server-only";
import { embedTexts, cosine } from "./embeddings";
import type { Category, ErrorRow } from "./scoring";

export interface EscalationPart {
  id: string;
  author_type: "admin" | "bot" | "user";
  author_id: string | null;
  body_text: string | null;
  sequence_order: number;
}

const num = (name: string, def: number) => {
  const v = process.env[name];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : def;
};

export interface EscalationOptions {
  /** Confirm a candidate is a GENUINE neglected-history violation (context review).
   *  Return false to suppress the flag. If omitted, threshold alone decides. */
  confirmNeglect?: (replyA: string, replyB: string) => Promise<boolean>;
}

export async function detectEscalationErrors(
  parts: EscalationPart[],
  neglectCat: Category | undefined,
  mismatchCat: Category | undefined,
  apiKey: string,
  opts: EscalationOptions = {}
): Promise<ErrorRow[]> {
  if (!apiKey) return [];
  const neglectThreshold = num("ESCALATION_NEGLECT_THRESHOLD", 0.9);
  const mismatchThreshold = num("ESCALATION_MISMATCH_THRESHOLD", 0.35);
  const mismatchEnabled = (process.env.ESCALATION_MISMATCH_ENABLED || "false") === "true";

  const agentParts = parts.filter(
    (p) => p.author_type === "admin" && (p.body_text ?? "").trim().length > 20
  );
  const distinctAgents = new Set(agentParts.map((p) => p.author_id ?? "?"));
  const customerText = parts
    .filter((p) => p.author_type === "user")
    .map((p) => (p.body_text ?? "").trim())
    .filter(Boolean)
    .join("\n")
    .trim();

  const wantNeglect = Boolean(neglectCat) && distinctAgents.size >= 2 && agentParts.length >= 2;
  const wantMismatch =
    Boolean(mismatchCat) && mismatchEnabled && customerText.length > 20 && agentParts.length >= 1;
  if (!wantNeglect && !wantMismatch) return [];

  // One batch embedding call: [customer?, ...agentReplies].
  const texts: string[] = [];
  const customerIdx = wantMismatch ? (texts.push(customerText), 0) : -1;
  const agentStart = texts.length;
  for (const p of agentParts) texts.push((p.body_text ?? "").trim());

  let vecs: number[][];
  try {
    vecs = await embedTexts(texts, apiKey);
  } catch {
    return []; // embeddings unavailable → skip silently, LLM/manual still apply
  }
  if (vecs.length !== texts.length) return [];

  const errors: ErrorRow[] = [];

  // --- Neglected Escalation History: cross-agent duplicate replies ---
  if (wantNeglect && neglectCat) {
    let best = { sim: 0, i: -1, j: -1 };
    for (let a = 0; a < agentParts.length; a++) {
      for (let b = a + 1; b < agentParts.length; b++) {
        if ((agentParts[a].author_id ?? "?") === (agentParts[b].author_id ?? "?")) continue;
        const sim = cosine(vecs[agentStart + a], vecs[agentStart + b]);
        if (sim > best.sim) best = { sim, i: a, j: b };
      }
    }
    if (best.sim >= neglectThreshold) {
      const dup = agentParts[best.j];
      const other = agentParts[best.i];
      // Context review: only count if a genuine violation is confirmed. Similar
      // wording alone isn't enough — the resolution/context must actually match.
      let confirmed = true;
      if (opts.confirmNeglect) {
        try {
          confirmed = await opts.confirmNeglect(other.body_text ?? "", dup.body_text ?? "");
        } catch {
          confirmed = false; // be conservative if confirmation fails
        }
      }
      if (confirmed) {
        errors.push({
          category_id: neglectCat.id,
          conversation_part_id: dup.id,
          severity: neglectCat.severity,
          deduction: Number(neglectCat.deduction),
          ai_explanation: `Two different agents gave the same resolution (similarity ${best.sim.toFixed(
            2
          )}) without verifying escalation history. [embedding + context-confirmed]`,
          evidence_quote: (dup.body_text ?? "").slice(0, 300),
        });
      }
    }
  }

  // --- Incorrect Escalation Channel/Team: response doesn't match context ---
  // A note containing "stuck" indicates a correct escalation (a stuck case), so
  // never flag a channel/team mismatch in that conversation.
  const hasStuckNote = parts.some((p) => (p.body_text ?? "").toLowerCase().includes("stuck"));
  if (wantMismatch && mismatchCat && customerIdx >= 0 && !hasStuckNote) {
    let maxSim = 0;
    let bestPart = agentParts[0];
    for (let a = 0; a < agentParts.length; a++) {
      const sim = cosine(vecs[customerIdx], vecs[agentStart + a]);
      if (sim > maxSim) {
        maxSim = sim;
        bestPart = agentParts[a];
      }
    }
    if (maxSim < mismatchThreshold) {
      errors.push({
        category_id: mismatchCat.id,
        conversation_part_id: bestPart.id,
        severity: mismatchCat.severity,
        deduction: Number(mismatchCat.deduction),
        ai_explanation: `Agent replies show low semantic match to the customer's context (max similarity ${maxSim.toFixed(
          2
        )}) — possible wrong team/channel. [embedding-detected]`,
        evidence_quote: (bestPart.body_text ?? "").slice(0, 300),
      });
    }
  }

  return errors;
}
