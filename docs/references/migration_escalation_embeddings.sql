-- ============================================================
-- Migration: hand the two "escalation" categories to the embedding detector.
-- Run once in the Supabase SQL editor.
--
-- These two are judged deterministically from embeddings (cross-agent duplicate
-- detection + customer/agent context match), not by the LLM — so remove them
-- from the LLM prompt by setting ai_scoreable = FALSE. Reviewers can still add
-- them manually, and the embedding detector adds them automatically at scoring.
-- ============================================================

UPDATE scoring_categories
SET ai_scoreable = FALSE
WHERE error_subtype IN (
  'Neglected Escalation History Verification',
  'Incorrect Escalation Channel/Team Assignment'
);
