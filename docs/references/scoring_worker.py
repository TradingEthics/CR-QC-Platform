"""
CR QC Platform — AI scoring worker (Google Gemini).

Pipeline (BRD Workflow 13.2):
  1. Pull conversations that are ingested but unscored and have >= 1 HUMAN
     agent reply (review_status = 'pending_scoring', admin_reply_count > 0).
  2. Build the rubric prompt + labeled thread, ask Gemini to DETECT errors
     (structured JSON, response_schema). Gemini never sums points.
  3. Compute the score deterministically:  final = max(0, 100 - Σ deductions),
     one deduction per distinct category hit.
  4. Route:  final < 75            -> pending_review (manual audit)
             CX present and 1-2    -> pending_review (angry customer)
             otherwise             -> auto_approved
     CX score is stored when Intercom provides it, and IGNORED when absent —
     a missing CX never lowers a score or forces review.
  5. Persist qc_assessments + qc_errors, update the conversation, and record the
     whole batch in scoring_runs for auditability.

Two execution paths share all parse/score/write logic:
  --sync   (default): one generate_content call per conversation. Reliable;
                      use this to validate scoring quality first.
  --batch  : Gemini Batch Mode (≈50% cheaper, async) for the scheduled worker.
             Enabled by GEMINI_USE_BATCH=true unless --sync overrides.

Env is read at call time (not import) so an exported shell var never shadows
.env — same dotenv gotcha the ingestion worker hit.

Usage:
    python scoring_worker.py --limit 10 --sync          # small live test
    python scoring_worker.py --dry-run --limit 5        # build prompts, no AI, no writes
    python scoring_worker.py --conversation <intercom_id> --sync
    python scoring_worker.py                             # scheduled run (batch if GEMINI_USE_BATCH)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from typing import Any, Optional

from dotenv import load_dotenv
from rich.console import Console

import scoring_prompt as sp

load_dotenv()
console = Console()

POLL_INTERVAL_SECONDS = 20
BATCH_TERMINAL_STATES = {"JOB_STATE_SUCCEEDED", "JOB_STATE_FAILED", "JOB_STATE_CANCELLED", "JOB_STATE_EXPIRED"}
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


# ------------------------------------------------------------------
# Config (read at call time)
# ------------------------------------------------------------------

def get_config() -> dict:
    return {
        "supabase_url": os.getenv("SUPABASE_URL", ""),
        "supabase_key": os.getenv("SUPABASE_SERVICE_KEY", ""),
        # Which provider to score with: 'gemini' or 'kimi' (OpenRouter).
        "provider": os.getenv("SCORING_PROVIDER", "gemini").lower(),
        # Gemini
        "gemini_key": os.getenv("GEMINI_API_KEY", ""),
        "model": os.getenv("GEMINI_MODEL", "gemini-3.6-flash"),
        "use_batch": os.getenv("GEMINI_USE_BATCH", "true").lower() == "true",
        "batch_size": int(os.getenv("SCORING_BATCH_SIZE", "10")),
        # Kimi via OpenRouter (fallback / free-tier-Gemini bypass)
        "openrouter_key": os.getenv("OPENROUTER_API_KEY", ""),
        "kimi_model": os.getenv("KIMI_MODEL", "moonshotai/kimi-k2.5"),
    }


# ------------------------------------------------------------------
# Data access
# ------------------------------------------------------------------

def fetch_unscored(supabase: Any, limit: int, intercom_id: Optional[str]) -> list[dict]:
    """Conversations ready to score: pending_scoring with a human reply."""
    q = (
        supabase.table("conversations")
        .select("id, intercom_id, inbox_id, agent_id, cx_score, subject, "
                "admin_reply_count, review_status, intercom_url")
        .eq("review_status", "pending_scoring")
        .gt("admin_reply_count", 0)
    )
    if intercom_id:
        q = q.eq("intercom_id", intercom_id)
    q = q.order("intercom_created_at", desc=False).limit(limit)
    return q.execute().data or []


def fetch_parts(supabase: Any, conversation_id: str) -> list[dict]:
    resp = (
        supabase.table("conversation_parts")
        .select("id, sequence_order, author_type, author_id, agent_id, body_text, part_type")
        .eq("conversation_id", conversation_id)
        .order("sequence_order")
        .execute()
    )
    return resp.data or []


def fetch_agent_names(supabase: Any) -> dict[str, str]:
    resp = supabase.table("agents").select("id, name").execute()
    return {a["id"]: a["name"] for a in (resp.data or [])}


# ------------------------------------------------------------------
# Scoring math (deterministic — independent of the model)
# ------------------------------------------------------------------

def compute_assessment(
    ai_errors: list[dict],
    cat_by_subtype: dict[str, dict],
    parts: list[dict],
) -> dict:
    """Turn the model's detected errors into a scored assessment.

    - One deduction per DISTINCT category (recurrences noted, not re-charged),
      so a few typos can't drive a conversation to zero.
    - Unknown category names from the model are dropped (schema enum should
      prevent them, but we stay defensive).
    """
    seq_to_part_id = {p.get("sequence_order"): p.get("id") for p in parts}

    by_category: dict[str, dict] = {}
    for err in ai_errors:
        subtype = (err.get("category") or "").strip()
        cat = cat_by_subtype.get(subtype)
        if not cat:
            continue  # unknown category — skip defensively
        if subtype not in by_category:
            by_category[subtype] = {
                "category": cat,
                "instances": [],
            }
        by_category[subtype]["instances"].append(err)

    error_rows: list[dict] = []
    total_deductions = 0.0
    for subtype, group in by_category.items():
        cat = group["category"]
        instances = group["instances"]
        first = instances[0]
        deduction = float(cat["deduction"])
        total_deductions += deduction

        note = first.get("explanation", "")
        if len(instances) > 1:
            note = f"{note} ({len(instances)} instances flagged)"

        seq = first.get("agent_reply_seq")
        part_id = seq_to_part_id.get(seq) if seq is not None else None

        error_rows.append({
            "category_id": cat["id"],
            "conversation_part_id": part_id,
            "severity": cat["severity"],
            "deduction": deduction,
            "ai_explanation": note,
            "evidence_quote": first.get("evidence_quote", ""),
        })

    final_score = max(0.0, 100.0 - total_deductions)
    return {
        "total_deductions": round(total_deductions, 2),
        "final_score": round(final_score, 2),
        "error_rows": error_rows,
    }


def route_status(final_score: float, cx_score: Optional[int]) -> str:
    """Review routing. QC score is the primary gate; CX only adds review when low."""
    if final_score < sp.PASS_MARK:
        return "pending_review"
    if cx_score is not None and cx_score <= 2:
        return "pending_review"
    return "auto_approved"


# ------------------------------------------------------------------
# Gemini calls
# ------------------------------------------------------------------

def _make_client(api_key: str):
    from google import genai
    return genai.Client(api_key=api_key)


def _gen_config(system_prompt: str, schema: dict):
    from google.genai import types
    return types.GenerateContentConfig(
        system_instruction=system_prompt,
        response_mime_type="application/json",
        response_schema=schema,
        temperature=0.0,
    )


def score_sync(client, model, system_prompt, schema, user_prompt) -> dict:
    """One synchronous scoring call. Returns {payload, prompt_tokens, completion_tokens, latency_ms}."""
    start = time.monotonic()
    resp = client.models.generate_content(
        model=model,
        contents=user_prompt,
        config=_gen_config(system_prompt, schema),
    )
    latency_ms = int((time.monotonic() - start) * 1000)
    payload = json.loads(resp.text)
    usage = getattr(resp, "usage_metadata", None)
    return {
        "payload": payload,
        "prompt_tokens": getattr(usage, "prompt_token_count", None) if usage else None,
        "completion_tokens": getattr(usage, "candidates_token_count", None) if usage else None,
        "latency_ms": latency_ms,
    }


def _strip_fences(text: str) -> str:
    """Remove ```json ... ``` fences some models wrap JSON in."""
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else t[3:]
        if t.rstrip().endswith("```"):
            t = t.rstrip()[:-3]
    return t.strip()


def score_sync_kimi(model, api_key, system_prompt, schema, user_prompt) -> dict:
    """One synchronous scoring call via Kimi (OpenRouter, OpenAI-compatible).

    OpenRouter's json_object mode doesn't enforce a schema, so we describe the
    exact schema in the system message and parse defensively. compute_assessment
    already tolerates missing/unknown fields.
    """
    import httpx

    sys_msg = (
        system_prompt
        + "\n\nRespond with ONLY a JSON object (no prose, no code fences) matching "
        "exactly this JSON schema:\n" + json.dumps(schema)
    )
    start = time.monotonic()
    resp = httpx.post(
        OPENROUTER_URL,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": sys_msg},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0,
            "response_format": {"type": "json_object"},
        },
        timeout=180.0,
    )
    resp.raise_for_status()
    data = resp.json()
    content = data["choices"][0]["message"]["content"]
    payload = json.loads(_strip_fences(content))
    usage = data.get("usage", {}) or {}
    return {
        "payload": payload,
        "prompt_tokens": usage.get("prompt_tokens"),
        "completion_tokens": usage.get("completion_tokens"),
        "latency_ms": int((time.monotonic() - start) * 1000),
    }


def score_batch(client, model, system_prompt, schema, user_prompts: list[str]) -> list[Optional[dict]]:
    """Gemini Batch Mode over many prompts. Returns one payload dict per prompt (None on failure).

    NOTE: batch is the cheaper scheduled path but must be smoke-tested live once
    (SDK batch response shapes vary by version). The --sync path is the tested
    default; validate scoring quality there first, then enable batch.
    """
    from google.genai import types

    inline_requests = [
        {
            "contents": [{"role": "user", "parts": [{"text": up}]}],
            "config": {
                "system_instruction": system_prompt,
                "response_mime_type": "application/json",
                "response_schema": schema,
                "temperature": 0.0,
            },
        }
        for up in user_prompts
    ]

    job = client.batches.create(model=model, src=inline_requests)
    console.print(f"  [dim]Batch submitted: {job.name}[/dim]")

    while getattr(job.state, "name", str(job.state)) not in BATCH_TERMINAL_STATES:
        time.sleep(POLL_INTERVAL_SECONDS)
        job = client.batches.get(name=job.name)
        console.print(f"  [dim]Batch state: {getattr(job.state, 'name', job.state)}[/dim]")

    state = getattr(job.state, "name", str(job.state))
    if state != "JOB_STATE_SUCCEEDED":
        raise RuntimeError(f"Batch job did not succeed: {state}")

    results: list[Optional[dict]] = []
    inlined = job.dest.inlined_responses if job.dest else []
    for item in inlined:
        try:
            resp = item.response
            results.append(json.loads(resp.text))
        except Exception as exc:  # noqa: BLE001 — one bad row shouldn't kill the batch
            console.print(f"  [yellow]⚠ batch item failed: {exc}[/yellow]")
            results.append(None)
    return results


# ------------------------------------------------------------------
# Persistence
# ------------------------------------------------------------------

def start_run(supabase: Any, provider: str, model: str) -> str:
    row = (
        supabase.table("scoring_runs")
        .insert({"provider": provider, "model_name": model})
        .execute()
    )
    return row.data[0]["id"]


def finish_run(supabase: Any, run_id: str, scored: int, failed: int, avg: Optional[float], errors: list) -> None:
    supabase.table("scoring_runs").update({
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "conversations_scored": scored,
        "conversations_failed": failed,
        "avg_score": round(avg, 2) if avg is not None else None,
        "error_log": errors,
    }).eq("id", run_id).execute()


def persist_assessment(
    supabase: Any,
    conv: dict,
    assessment: dict,
    overall_reasoning: str,
    provider: str,
    model: str,
    run_id: str,
    tokens: dict,
) -> None:
    """Write qc_assessments + qc_errors and update the conversation, atomically-ish."""
    a_row = (
        supabase.table("qc_assessments")
        .insert({
            "conversation_id": conv["id"],
            "total_deductions": assessment["total_deductions"],
            "final_score": assessment["final_score"],
            "provider": provider,
            "model_name": model,
            "ai_reasoning": overall_reasoning,
            "prompt_tokens": tokens.get("prompt_tokens"),
            "completion_tokens": tokens.get("completion_tokens"),
            "latency_ms": tokens.get("latency_ms"),
            "scoring_run_id": run_id,
        })
        .execute()
    )
    assessment_id = a_row.data[0]["id"]

    for err in assessment["error_rows"]:
        err_row = dict(err)
        err_row["assessment_id"] = assessment_id
        supabase.table("qc_errors").insert(err_row).execute()

    status = route_status(assessment["final_score"], conv.get("cx_score"))
    supabase.table("conversations").update({
        "qc_score": assessment["final_score"],
        "review_status": status,
    }).eq("id", conv["id"]).execute()


# ------------------------------------------------------------------
# Orchestration
# ------------------------------------------------------------------

def run(limit: int, dry_run: bool, use_batch: bool, intercom_id: Optional[str],
        provider_override: Optional[str] = None) -> None:
    cfg = get_config()
    if provider_override:
        cfg["provider"] = provider_override
    if not cfg["supabase_url"] or not cfg["supabase_key"]:
        console.print("[red]ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY required[/red]")
        sys.exit(1)

    from supabase import create_client
    supabase = create_client(cfg["supabase_url"], cfg["supabase_key"])

    categories = sp.load_categories(supabase, ai_only=True)
    knowledge_base = sp.load_knowledge_base()
    system_prompt = sp.build_system_prompt(categories, knowledge_base)
    schema = sp.build_response_schema(categories)
    cat_by_subtype = sp.category_index(categories)
    kb_note = f", knowledge base {len(knowledge_base)} chars" if knowledge_base else " (no knowledge base found)"
    console.print(f"[bold]Loaded {len(categories)} AI-scoreable categories{kb_note}.[/bold]")

    convs = fetch_unscored(supabase, limit, intercom_id)
    if not convs:
        console.print("[yellow]No unscored conversations with human replies found.[/yellow]")
        return
    console.print(f"[bold]Scoring {len(convs)} conversation(s).[/bold]")

    agent_names = fetch_agent_names(supabase)

    # Build prompts up front (needed for both paths and for --dry-run).
    prepared: list[dict] = []
    for conv in convs:
        parts = fetch_parts(supabase, conv["id"])
        thread = sp.build_conversation_text(parts, agent_names)
        user_prompt = sp.build_user_prompt(thread, conv.get("subject"))
        prepared.append({"conv": conv, "parts": parts, "user_prompt": user_prompt})

    if dry_run:
        console.print("[cyan]--dry-run: showing the first prompt, no AI call, no writes.[/cyan]")
        console.print(f"\n[bold]SYSTEM PROMPT ({len(system_prompt)} chars):[/bold]\n{system_prompt[:1500]}...")
        console.print(f"\n[bold]USER PROMPT for {prepared[0]['conv']['intercom_id']}:[/bold]\n{prepared[0]['user_prompt'][:2000]}")
        return

    provider = cfg["provider"] if cfg["provider"] in ("gemini", "kimi") else "gemini"
    if provider == "kimi":
        if not cfg["openrouter_key"]:
            console.print("[red]ERROR: OPENROUTER_API_KEY required for Kimi scoring[/red]")
            sys.exit(1)
        model = cfg["kimi_model"]
    else:
        if not cfg["gemini_key"]:
            console.print("[red]ERROR: GEMINI_API_KEY required for scoring[/red]")
            sys.exit(1)
        model = cfg["model"]

    run_id = start_run(supabase, provider, model)
    scored, failed, score_sum, err_log = 0, 0, 0.0, []

    if provider == "gemini" and use_batch:
        client = _make_client(cfg["gemini_key"])
        console.print("[bold]Path: Gemini Batch Mode[/bold]")
        try:
            payloads = score_batch(
                client, model, system_prompt, schema,
                [p["user_prompt"] for p in prepared],
            )
        except Exception as exc:  # noqa: BLE001
            console.print(f"[red]Batch failed: {exc}[/red]")
            finish_run(supabase, run_id, 0, len(prepared), None, [{"batch_error": str(exc)}])
            sys.exit(1)

        for prep, payload in zip(prepared, payloads):
            ok = _finalize_one(supabase, prep, payload, cat_by_subtype, provider, model, run_id, {}, err_log)
            if ok is None:
                failed += 1
            else:
                scored += 1
                score_sum += ok
    else:
        gemini_client = _make_client(cfg["gemini_key"]) if provider == "gemini" else None
        console.print(f"[bold]Path: synchronous ({provider} / {model})[/bold]")
        for prep in prepared:
            conv = prep["conv"]
            try:
                if provider == "kimi":
                    result = score_sync_kimi(model, cfg["openrouter_key"], system_prompt, schema, prep["user_prompt"])
                else:
                    result = score_sync(gemini_client, model, system_prompt, schema, prep["user_prompt"])
                tokens = {k: result[k] for k in ("prompt_tokens", "completion_tokens", "latency_ms")}
                ok = _finalize_one(supabase, prep, result["payload"], cat_by_subtype, provider, model, run_id, tokens, err_log)
                if ok is None:
                    failed += 1
                else:
                    scored += 1
                    score_sum += ok
                    console.print(f"  [green]✓[/green] {conv['intercom_id']}: {ok}")
            except Exception as exc:  # noqa: BLE001
                failed += 1
                err_log.append({"conversation": conv["intercom_id"], "error": str(exc)})
                console.print(f"  [red]✗[/red] {conv['intercom_id']}: {exc}")

    avg = (score_sum / scored) if scored else None
    finish_run(supabase, run_id, scored, failed, avg, err_log)
    console.print(f"\n[bold green]Done.[/bold green] scored={scored} failed={failed} avg={round(avg, 2) if avg else 'n/a'}")


def _finalize_one(supabase, prep, payload, cat_by_subtype, provider, model, run_id, tokens, err_log) -> Optional[float]:
    """Score + persist one conversation from a model payload. Returns final_score or None on failure."""
    conv = prep["conv"]
    if payload is None:
        err_log.append({"conversation": conv["intercom_id"], "error": "no payload"})
        return None
    try:
        assessment = compute_assessment(payload.get("errors", []), cat_by_subtype, prep["parts"])
        persist_assessment(
            supabase, conv, assessment,
            payload.get("overall_reasoning", ""), provider, model, run_id, tokens,
        )
        return assessment["final_score"]
    except Exception as exc:  # noqa: BLE001
        err_log.append({"conversation": conv["intercom_id"], "error": str(exc)})
        console.print(f"  [red]✗[/red] {conv['intercom_id']}: {exc}")
        return None


def main() -> None:
    parser = argparse.ArgumentParser(description="CR QC Platform — Gemini scoring worker")
    parser.add_argument("--limit", type=int, default=10, help="Max conversations to score")
    parser.add_argument("--dry-run", action="store_true", help="Build prompts only; no AI call, no DB writes")
    parser.add_argument("--sync", action="store_true", help="Force synchronous scoring (overrides GEMINI_USE_BATCH)")
    parser.add_argument("--batch", action="store_true", help="Force Gemini Batch Mode")
    parser.add_argument("--provider", choices=["gemini", "kimi"], default=None,
                        help="Scoring provider (overrides SCORING_PROVIDER env)")
    parser.add_argument("--conversation", type=str, default=None, help="Score a single conversation by intercom_id")
    args = parser.parse_args()

    cfg = get_config()
    use_batch = cfg["use_batch"]
    if args.sync:
        use_batch = False
    if args.batch:
        use_batch = True

    run(limit=args.limit, dry_run=args.dry_run, use_batch=use_batch,
        intercom_id=args.conversation, provider_override=args.provider)


if __name__ == "__main__":
    main()
