"""
One-off re-score driver: re-score July 2026 conversations under the calibrated
rubric (skipped/manual categories + new prompt rules), EXCLUDING perfect 100s.

- Gemini free tier first; switches to OpenRouter/DeepSeek on quota (429).
- Deletes each conversation's old qc_assessments + qc_errors, writes fresh ones,
  and updates the conversation's qc_score + review_status.

Run from docs/references:
    python rescore_july.py
"""
from __future__ import annotations
import os

from supabase import create_client
import scoring_worker as sw
import scoring_prompt as sp

START, END = "2026-07-01", "2026-08-01"
MAX_SCORE_EXCL = 100  # skip perfect scores


def is_quota(exc: Exception) -> bool:
    s = str(exc)
    return "429" in s or "RESOURCE_EXHAUSTED" in s


def main() -> None:
    cfg = sw.get_config()
    supabase = create_client(cfg["supabase_url"], cfg["supabase_key"])

    cats = sp.load_categories(supabase, ai_only=True)
    kb = sp.load_knowledge_base()
    system_prompt = sp.build_system_prompt(cats, kb)
    schema = sp.build_response_schema(cats)
    cat_by_subtype = sp.category_index(cats)
    agent_names = sw.fetch_agent_names(supabase)
    print(f"Loaded {len(cats)} AI-scoreable categories (KB {len(kb)} chars).")

    # Target set: July, scored, < 100, has a human reply.
    rows = (
        supabase.table("conversations")
        .select("id, intercom_id, cx_score, subject")
        .gte("intercom_created_at", START)
        .lt("intercom_created_at", END)
        .not_.is_("qc_score", "null")
        .lt("qc_score", MAX_SCORE_EXCL)
        .gt("admin_reply_count", 0)
        .neq("review_status", "reviewed")  # never overwrite a manual review
        .limit(int(os.getenv("RESCORE_LIMIT", "5000")))
        .execute()
        .data
        or []
    )
    print(f"Re-scoring {len(rows)} conversation(s).")

    gekey, gemodel = cfg["gemini_key"], cfg["model"]
    orkey, ormodel = cfg["openrouter_key"], cfg["openrouter_model"]
    gclient = sw._make_client(gekey) if gekey else None
    provider = "gemini" if gclient else "openrouter"
    run_id = sw.start_run(supabase, "openrouter", ormodel)

    scored = failed = gem = deep = 0
    for i, conv in enumerate(rows):
        try:
            parts = sw.fetch_parts(supabase, conv["id"])
            thread = sp.build_conversation_text(parts, agent_names)
            user_prompt = sp.build_user_prompt(thread, conv.get("subject"))
            if provider == "gemini":
                try:
                    result = sw.score_sync(gclient, gemodel, system_prompt, schema, user_prompt)
                    model = gemodel
                    gem += 1
                except Exception as exc:  # noqa: BLE001
                    if is_quota(exc) and orkey:
                        print("  Gemini quota hit -> switching to OpenRouter/DeepSeek")
                        provider = "openrouter"
                        result = sw.score_sync_openrouter(ormodel, orkey, system_prompt, schema, user_prompt)
                        model = ormodel
                        deep += 1
                    else:
                        raise
            else:
                result = sw.score_sync_openrouter(ormodel, orkey, system_prompt, schema, user_prompt)
                model = ormodel
                deep += 1

            payload = result["payload"]
            assessment = sw.compute_assessment(payload.get("errors", []), cat_by_subtype, parts)

            # Replace old assessments/errors for this conversation.
            old = supabase.table("qc_assessments").select("id").eq("conversation_id", conv["id"]).execute().data or []
            for a in old:
                supabase.table("qc_errors").delete().eq("assessment_id", a["id"]).execute()
            supabase.table("qc_assessments").delete().eq("conversation_id", conv["id"]).execute()

            tokens = {k: result.get(k) for k in ("prompt_tokens", "completion_tokens", "latency_ms")}
            sw.persist_assessment(
                supabase, conv, assessment, payload.get("overall_reasoning", ""),
                "gemini" if model == gemodel else "openrouter", model, run_id, tokens,
            )
            scored += 1
            if (i + 1) % 20 == 0:
                print(f"  {i+1}/{len(rows)} — scored={scored} failed={failed} (gem={gem} deep={deep})")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"  x {conv['intercom_id']}: {exc}")

    sw.finish_run(supabase, run_id, scored, failed, None, [])
    print(f"\nDone. scored={scored} failed={failed} (gemini={gem}, deepseek={deep})")


if __name__ == "__main__":
    main()
