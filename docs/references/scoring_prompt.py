"""
CR QC Platform — Scoring prompt builder.

Turns the DB-seeded QC rubric + a conversation thread into the exact inputs
Gemini needs for structured scoring:

  - build_system_prompt(categories) -> str      the rubric + rules (LLM-as-judge)
  - build_conversation_text(parts)  -> str      the labeled thread to grade
  - build_response_schema(categories) -> dict   forces valid JSON output
  - load_categories(supabase)       -> list     the 26 active categories

Design contract that the rest of the engine relies on:

  * The AI ONLY detects errors and names the category (from a fixed enum).
    It never sums points. scoring_worker.py computes the score from each
    category's `deduction` in the DB, so the math is deterministic and the
    rubric can change without touching prompt logic.
  * Category identity passed to/from the model is the `error_subtype` string
    (unique across active categories — enforced below). That string is the
    enum the model must choose from, and the worker maps it back to the row.
"""

from __future__ import annotations

from typing import Any, Optional


# Grading bands (shared source of truth for worker routing + dashboard labels).
# 75 is the pass mark: a score of exactly 75 passes.
PASS_MARK = 75.0

BANDS: list[tuple[float, str]] = [
    (90.0, "Excellent"),   # >= 90
    (80.0, "Good"),        # 80–89
    (75.0, "Average"),     # 75–79
    (0.0, "Fail"),         # < 75  -> manual audit
]


def qc_band(score: Optional[float]) -> str:
    """Map a QC score to its grading band label."""
    if score is None:
        return "Unscored"
    for threshold, label in BANDS:
        if score >= threshold:
            return label
    return "Fail"


def load_categories(supabase: Any, ai_only: bool = False) -> list[dict]:
    """Load active scoring categories from Supabase, ordered by sort_order.

    ai_only=True returns only categories the AI can judge from the thread +
    knowledge base (ai_scoreable). Manual-only categories (needing payment/macro/
    escalation ground truth the AI lacks) are excluded from the scoring prompt so
    the model can never hallucinate them, but stay available to human reviewers.

    Raises if the rubric is empty (nothing seeded) or if two active categories
    share an error_subtype — the subtype is the model's category key and must
    be unique, or scoring would map an error to the wrong deduction.
    """
    q = (
        supabase.table("scoring_categories")
        .select("id, section, severity, deduction, error_type, error_subtype, "
                "description, sort_order, ai_scoreable")
        .eq("is_active", True)
    )
    if ai_only:
        q = q.eq("ai_scoreable", True)
    resp = q.order("sort_order").execute()
    categories: list[dict] = resp.data or []
    if not categories:
        raise RuntimeError(
            "No active scoring_categories found. Run schema.sql / migration_scorecard_v2.sql first."
        )

    seen: dict[str, dict] = {}
    for cat in categories:
        key = (cat.get("error_subtype") or "").strip()
        if not key:
            raise RuntimeError(
                f"Category {cat['id']} ({cat.get('error_type')}) has no error_subtype; "
                "the subtype is the model's category key and is required."
            )
        if key in seen:
            raise RuntimeError(
                f"Duplicate error_subtype '{key}' across active categories "
                f"({seen[key]['id']} and {cat['id']}). Subtypes must be unique for scoring."
            )
        seen[key] = cat
    return categories


def category_index(categories: list[dict]) -> dict[str, dict]:
    """subtype -> category row, for mapping the model's answer back to a deduction."""
    return {(c["error_subtype"] or "").strip(): c for c in categories}


def load_knowledge_base(path: str = "knowledge_base.md") -> str:
    """Load the FundedNext rules/process reference used to judge Incorrect
    Information. Returns '' if the file is missing (scoring still works; the
    model just judges Incorrect Information more conservatively without it)."""
    import os
    kb_path = path if os.path.isabs(path) else os.path.join(os.path.dirname(__file__), path)
    try:
        with open(kb_path, "r", encoding="utf-8") as fh:
            return fh.read().strip()
    except FileNotFoundError:
        return ""


# ------------------------------------------------------------------
# System prompt (the rubric + judging rules)
# ------------------------------------------------------------------

_SYSTEM_HEADER = """\
You are a senior Quality Control auditor for FundedNext's Case Resolution (CR) \
email support team. You grade the QUALITY of the human support agent's replies \
in a customer conversation against a fixed QC scorecard.

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
- For every error you flag, return:
    category           : the exact category name from the allowed list
    agent_reply_seq    : the #seq number of the agent reply containing the error
    evidence_quote     : the exact text from the agent's reply that shows it
    explanation        : one concise sentence on why it violates that category
- Do NOT calculate any score or deduction. You only identify errors; the system
  computes the score from your findings.
- Flag each distinct category at most once per conversation, even if it recurs.
  If a category recurs, note it in the explanation (e.g., "3 instances").
- If the agent replies are clean, return an empty errors list.

IMPORTANT CONTEXT — this is a COMPLIANCE-style team, not casual chat support:
- Replies are intentionally FORMAL, LONG, detailed, and process-driven. Long or
  templated replies are NORMAL here and are NOT errors by themselves.
- [note] parts are internal agent notes, not customer-facing messages.

CATEGORY-SPECIFIC JUDGING RULES (apply strictly to reduce false positives):
- "Information Overload" / "Overcomplication of Responses": Do NOT flag merely for
  length or detail. Compliance answers are legitimately long. Only flag when the
  reply is clearly excessive or convoluted RELATIVE TO WHAT THE FULL CONVERSATION
  REQUIRES. Judge against the whole conversation, not the size of one message.
- "Overutilization of ChatGPT/Automation Tools": Templated greeting/closing
  sentences are standard process and may sound formal or robotic — do NOT flag
  them. Only flag when a reply is clearly out of context, or disproportionately
  large/irrelevant for the conversation.
- "Inadequate/Excessive Engagement": Do NOT flag when the apparent issue stems
  from an internal [note] — notes are a needed part of the process.
- "Spelling Mistakes" / "Typos" / "Context-Altering Spelling Errors" /
  "Grammatical Mistakes": Read every word CAREFULLY. Only flag a word you are
  certain is misspelled/mistyped. Do NOT flag correctly-spelled words, proper
  names, product/brand terms, or regional spellings. When in any doubt, DO NOT flag.

SCORECARD (severity shown for your judgment; you do not apply the points):
"""

_SYSTEM_FOOTER = """\

overall_reasoning: return a SHORT bulleted summary — each point on its own line \
starting with "- ". Do not write a paragraph.

Return ONLY the structured JSON defined by the response schema. No prose outside it.\
"""


def build_system_prompt(categories: list[dict], knowledge_base: str = "") -> str:
    """Assemble the full rubric prompt grouped by severity tier.

    knowledge_base: FundedNext rules/process reference (from load_knowledge_base)
    appended so the model can judge Incorrect Information against documented rules.
    """
    # Group by section, preserving sort order.
    tiers: dict[str, list[dict]] = {}
    for cat in categories:
        tiers.setdefault(cat["section"], []).append(cat)

    lines: list[str] = [_SYSTEM_HEADER]
    for section, cats in tiers.items():
        ded = cats[0]["deduction"]
        lines.append(f"\n=== {section} (−{_fmt(ded)} points each) ===")
        for cat in cats:
            name = cat["error_subtype"]
            lines.append(f"\n• {name}")
            if cat.get("error_type") and cat["error_type"] != name:
                lines.append(f"  (type: {cat['error_type']})")
            lines.append(f"  {cat['description'].strip()}")

    if knowledge_base:
        lines.append("\n\n" + "=" * 60)
        lines.append("KNOWLEDGE BASE — FundedNext rules (ground truth for Incorrect Information)")
        lines.append("=" * 60)
        lines.append(knowledge_base)

    lines.append(_SYSTEM_FOOTER)
    return "\n".join(lines)


def build_conversation_text(parts: list[dict], agent_name_by_id: dict[str, str]) -> str:
    """Render conversation_parts rows into a labeled, grade-ready transcript.

    parts: rows from conversation_parts (author_type, agent_id, body_text,
           sequence_order, part_type), ordered by sequence_order.
    agent_name_by_id: agents.id -> display name, to label agent replies.
    """
    ordered = sorted(parts, key=lambda p: p.get("sequence_order", 0))
    out: list[str] = []
    for p in ordered:
        body = (p.get("body_text") or "").strip()
        if not body:
            continue
        atype = p.get("author_type")
        seq = p.get("sequence_order", 0)
        if atype == "user":
            label = "[CUSTOMER]"
        elif atype == "bot":
            label = "[BOT / FIN AI]"
        elif atype == "admin":
            name = agent_name_by_id.get(p.get("agent_id"), "Agent")
            label = f"[AGENT: {name} #{seq}]"
        else:
            label = f"[{(atype or 'unknown').upper()} #{seq}]"
        out.append(f"{label}\n{body}")
    return "\n\n".join(out)


def build_user_prompt(conversation_text: str, subject: Optional[str] = None) -> str:
    """The per-conversation user message."""
    header = "Grade the AGENT replies in the following CR support conversation."
    if subject:
        header += f'\nConversation subject: "{subject}"'
    return f"{header}\n\n--- CONVERSATION START ---\n\n{conversation_text}\n\n--- CONVERSATION END ---"


def build_response_schema(categories: list[dict]) -> dict:
    """JSON schema constraining Gemini's output (google-genai response_schema).

    The `category` field is an enum of the allowed subtypes, so the model can
    only return a category we can map to a deduction.
    """
    allowed = [c["error_subtype"] for c in categories]
    return {
        "type": "object",
        "properties": {
            "errors": {
                "type": "array",
                "description": "Every QC error found in the agent's replies. Empty if none.",
                "items": {
                    "type": "object",
                    "properties": {
                        "category": {
                            "type": "string",
                            "enum": allowed,
                            "description": "Exact scorecard category name.",
                        },
                        "agent_reply_seq": {
                            "type": "integer",
                            "description": "The #seq of the agent reply containing the error.",
                        },
                        "evidence_quote": {
                            "type": "string",
                            "description": "Exact text from the agent reply demonstrating the error.",
                        },
                        "explanation": {
                            "type": "string",
                            "description": "One concise sentence on why it violates the category.",
                        },
                    },
                    "required": ["category", "evidence_quote", "explanation"],
                },
            },
            "overall_reasoning": {
                "type": "string",
                "description": "Brief overall summary of the agent's performance in this conversation.",
            },
        },
        "required": ["errors", "overall_reasoning"],
    }


def _fmt(num: Any) -> str:
    """Format a deduction like 7.5 or 20 without trailing .0 noise."""
    try:
        f = float(num)
    except (TypeError, ValueError):
        return str(num)
    return str(int(f)) if f == int(f) else str(f)
