-- ============================================================
-- Migration: QC rubric calibration (Aug 2026) — run once in Supabase SQL editor.
-- (Already applied to the live DB via API; this file documents/reproduces it.)
--
-- CR is a compliance-style team: replies are formal, long, and process-driven.
-- These changes reduce false positives from the AI and move judgment-heavy
-- categories to manual review.
-- ============================================================

-- 1. Skip entirely — not applicable to compliance-team responses.
UPDATE scoring_categories SET is_active = FALSE
WHERE error_subtype IN ('Empathy Spiel Missing', 'Mismatched Emotional Tone');

-- 2. Manual-only — the AI over-flags these without full multi-thread context.
--    Incorrect Information: a reply can be correct in context even vs. the KB.
--    Lack of Investigation: investigation may have happened in another email thread.
UPDATE scoring_categories SET ai_scoreable = FALSE
WHERE error_subtype IN ('Incorrect Information', 'Lack of Investigation');

-- 3. (From migration_escalation_embeddings.sql) the two escalation categories
--    are handled by the embedding detector, not the LLM prompt:
UPDATE scoring_categories SET ai_scoreable = FALSE
WHERE error_subtype IN (
  'Neglected Escalation History Verification',
  'Incorrect Escalation Channel/Team Assignment'
);
