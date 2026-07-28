-- ============================================================
-- Migration: ai_scoreable flag + escalation heuristics
-- Run ONCE in the Supabase SQL editor (after migration_scorecard_v2.sql).
--
-- Adds an ai_scoreable flag so the AI prompt only offers categories it can
-- actually judge from the email thread + knowledge base. Categories needing
-- data the AI cannot see (payment backend, macro library, internal escalation
-- criteria) stay TRUE only for manual reviewers, FALSE for the AI.
--
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE scoring_categories ADD COLUMN IF NOT EXISTS ai_scoreable BOOLEAN DEFAULT TRUE;

-- Default everything back to AI-scoreable, then switch off the manual-only ones.
UPDATE scoring_categories SET ai_scoreable = TRUE;

-- Manual-only: AI lacks the ground truth to judge these.
UPDATE scoring_categories SET ai_scoreable = FALSE
WHERE error_subtype IN (
  'Refund/Payout Accuracy',              -- needs payment backend data
  'Outdated or Inadequate Macro Usage',  -- no macro library; process changes constantly
  'Lack of Escalation',                  -- needs internal escalation criteria
  'Unnecessary Escalation'               -- needs to know internal capability
);

-- Sharpen the two escalation categories the AI CAN detect, using the
-- thread-visible heuristics defined by the QC lead.
UPDATE scoring_categories
SET description = 'Flag when the client appears to have received the same or a near-duplicate response from more than one agent across the thread — a sign the agent did not review prior escalation/response history before replying, risking a duplicate case. Detect this from repeated agent replies with substantially the same content directed at the same client concern.'
WHERE error_subtype = 'Neglected Escalation History Verification';

UPDATE scoring_categories
SET description = 'Flag when the agent''s reply does not match the client''s actual issue or context — e.g., the response addresses a different problem than the one the client raised — indicating the case was handled or routed incorrectly. Judge strictly from whether the agent''s response substantively addresses the client''s stated concern.'
WHERE error_subtype = 'Incorrect Escalation Channel/Team Assignment';

-- Verify:
--   SELECT error_subtype, ai_scoreable FROM scoring_categories WHERE ai_scoreable = FALSE ORDER BY sort_order;
--   -> 4 rows: Refund/Payout Accuracy, Outdated or Inadequate Macro Usage, Lack of Escalation, Unnecessary Escalation
