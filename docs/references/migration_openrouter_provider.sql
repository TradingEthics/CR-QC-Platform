-- ============================================================
-- Migration: add 'openrouter' to scoring_provider enum
-- Run ONCE in the Supabase SQL editor before scoring via OpenRouter.
--
-- The provider column records the transport ('openrouter'); the specific model
-- (e.g. deepseek/deepseek-v4-flash) is stored in model_name. Idempotent.
-- ============================================================

ALTER TYPE scoring_provider ADD VALUE IF NOT EXISTS 'openrouter';

-- Verify:
--   SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
--   WHERE t.typname = 'scoring_provider' ORDER BY e.enumsortorder;
--   -> gemini, kimi, manual, openrouter
