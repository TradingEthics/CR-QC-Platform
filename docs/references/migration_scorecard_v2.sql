-- ============================================================
-- Migration: Scorecard v2 + Gemini provider
-- Run ONCE in the Supabase SQL editor (Project → SQL Editor → paste → Run).
--
-- What it does:
--   1. Re-labels error_severity so the 4 tiers match the current scorecard:
--        old: critical_fail(50) · critical(15) · significant(15) · major(7.5)
--        new: critical_fail(50) · major(20)    · significant(15) · minor(7.5)
--   2. Ensures scoring_provider has 'gemini' and 'kimi'.
--   3. Re-seeds scoring_categories with the 26 current categories.
--   4. Rebuilds agent_qc_summary with the new severity labels.
--
-- Safe to run because no AI scoring has happened yet (qc_errors is empty).
-- The enum rename block is idempotent; the whole script can be re-run.
-- ============================================================

BEGIN;

-- 1. error_severity relabel (rename, not add — usable immediately, no data rewrite)
DO $$
BEGIN
  -- 7.5 tier: 'major' -> 'minor'  (do this first, before reusing the name 'major')
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'error_severity' AND e.enumlabel = 'major')
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'error_severity' AND e.enumlabel = 'minor') THEN
    ALTER TYPE error_severity RENAME VALUE 'major' TO 'minor';
  END IF;

  -- 15/20 tier: 'critical' -> 'major'
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'error_severity' AND e.enumlabel = 'critical') THEN
    ALTER TYPE error_severity RENAME VALUE 'critical' TO 'major';
  END IF;
END $$;

-- 2. scoring_provider: make sure the AI providers exist (live DB may predate them)
ALTER TYPE scoring_provider ADD VALUE IF NOT EXISTS 'gemini';
ALTER TYPE scoring_provider ADD VALUE IF NOT EXISTS 'kimi';

COMMIT;

-- ------------------------------------------------------------
-- 3. Re-seed scoring_categories (separate tx so renamed labels are committed)
-- ------------------------------------------------------------
BEGIN;

DELETE FROM scoring_categories;

INSERT INTO scoring_categories (section, severity, deduction, error_type, error_subtype, description, sort_order) VALUES

-- CRITICAL FAIL (−50) — Zero Tolerance
('Critical Fail', 'critical_fail', 50, 'Error Leading to a Loss of Business', 'Error Leading to a Loss of Business',
 'Agent provided incorrect information or behaved unprofessionally, which could result in a direct or potential loss of income. This also encompasses situations where agents provided inaccurate pricing information to clients or made payment-related mistakes impacting the company''s profitability.', 1),

('Critical Fail', 'critical_fail', 50, 'Zero Tolerance', 'Non-Compliant Ticket/Email Closure',
 'Agent abruptly closed an Email without providing any response to the client, an action considered unacceptable due to its substantial negative influence on both customer contentment and the company''s reputation.', 2),

('Critical Fail', 'critical_fail', 50, 'Zero Tolerance', 'Refund/Payout Accuracy',
 'Agent made an error affecting the accuracy of a refund or payout — issuing, promising, or processing an incorrect refund/payout amount, or mishandling refund/payout eligibility — impacting the client and the company financially. (Definition was blank on the source scorecard; confirm exact wording with QC lead.)', 3),

('Critical Fail', 'critical_fail', 50, 'Zero Tolerance', 'Unauthorized Information Disclosure',
 'Agent disclosed sensitive information like tool specifics, personal contact details, or restricted data to clients. Such behaviors are strictly forbidden because they pose potential security and privacy hazards.', 4),

-- MAJOR ERROR (−20)
('Major Error', 'major', 20, 'Incorrect Information', 'Incorrect Information',
 'Ensure that all information shared with the client is accurate and consistent with FundedNext''s policies, including rules, FAQs, and terms.', 10),

('Major Error', 'major', 20, 'Incorrect Information', 'Ensure correct usage of FundedNext branding',
 'Agent used incorrect FundedNext branding, including usage of capslock e.g., FundedNext Account, FundedNext Challenge Account, Stellar Instant FundedNext Account, FundedNext Phase, Challenge Phase, Stellar 1-Step Account, Stellar Lite Account, Futures Challenge Account, Futures FundedNext Account, Phase 1 of FundedNext Challenge Account. Any misspellings or incorrect branding of FundedNext should be corrected immediately (e.g., "FundedNext" should always be capitalized).', 11),

('Major Error', 'major', 20, 'Incorrect Information', 'Context-Altering Spelling Errors',
 'If a spelling error substantially changes the meaning of the sentence, it will lead to a deduction on the first attempt. For instance, the difference between "HFT trading is not allowed" and "HFT trading is now allowed" can result in such deductions. Be cautious of spelling errors that may change the meaning of important terms.', 12),

('Major Error', 'major', 20, 'Lack of Professionalism', 'Inappropriate/Unprofessional Interaction',
 'Agent exhibited unprofessional conduct when dealing with clients, which encompassed behaviors like being impolite, using sarcasm, using abusive language, or adopting a condescending tone. These actions can have a substantial negative impact on the client''s experience and the overall image of the support team.', 13),

('Major Error', 'major', 20, 'Lack of Escalation/Unnecessary Escalation', 'Lack of Escalation',
 'Agent failed to escalate an issue that clearly requires attention or intervention from other stakeholders. This lack of escalation can result in prolonged resolution times, increased customer frustration, and a negative impact on customer satisfaction. Ensure proper escalation to relevant teams like Pro Support Team or Business Operations Team etc. when needed.', 14),

('Major Error', 'major', 20, 'Lack of Escalation/Unnecessary Escalation', 'Unnecessary Escalation',
 'Agent chose to escalate a case to other stakeholders even when they possessed the capability to resolve the issue independently. Unwarranted escalations can result in inefficiencies, increased workload for different departments, and delays in addressing legitimately pressing concerns. Double-check prior escalation history to avoid duplicate cases and unnecessary delays.', 15),

('Major Error', 'major', 20, 'Lack of Escalation/Unnecessary Escalation', 'Incorrect Escalation Channel/Team Assignment',
 'Agent overlooked the specified criteria for escalation or mistakenly escalated the case to the wrong team, leading to delays in resolution and misallocation of resources.', 16),

('Major Error', 'major', 20, 'Lack of Escalation/Unnecessary Escalation', 'Neglected Escalation History Verification',
 'Agent failed to review the prior escalation records, which resulted in the submission of a duplicate case to CR, RM, BDev, Finance, Pro Support, or Discord, leading to delays in resolving the matter.', 17),

('Major Error', 'major', 20, 'Lack of Investigation', 'Lack of Investigation',
 'The agent closed the ticket or email without thoroughly examining the client''s concern while overlooking some important details. Verify that all client issues are thoroughly investigated before responding or escalating. Ensure that responses regarding accounts are factually correct and aligned with our rules.', 18),

('Major Error', 'major', 20, 'Outdated Macro Usage', 'Outdated or Inadequate Macro Usage',
 'Agent used a macro that needed editing, paraphrasing, or utilized an outdated macro that failed to adequately acknowledge or resolve the client''s problem.', 19),

('Major Error', 'major', 20, 'Empathy', 'Empathy Spiel Missing',
 'Agent failed to express any kind of empathy for any inconvenience the client is encountering, regardless of whether the issue originated from our end or not. This also includes instances where the agent doesn''t integrate empathetic language to reassure the client that their concerns are acknowledged. Ensure empathy is conveyed when addressing client concerns related to FundedNext Accounts.', 20),

('Major Error', 'major', 20, 'Empathy', 'Mismatched Emotional Tone',
 'Instead of displaying an appropriate emotional tone that acknowledges the customer''s feelings, agent''s response might come across as indifferent, robotic, or even dismissive. Avoid using a tone that could be perceived as robotic or indifferent unless it''s absolutely necessary; ensure a supportive approach, especially when dealing with evaluation accounts.', 21),

-- SIGNIFICANT ERROR (−15)
('Significant Error', 'significant', 15, 'Missing Information', 'Missing Information',
 'When a client has multiple questions and the agent misses multiple query, it''s categorized as a missing information error. However, if it misses 1/2 queries then it will not be an error.', 30),

('Significant Error', 'significant', 15, 'Exaggerated Engagement', 'Exaggerated Engagement',
 'If there is a situation where a double payment occurs, the agent proactively offered a refund without waiting for the client to raise the issue.', 31),

-- MINOR ERROR (−7.5)
('Minor Error', 'minor', 7.5, 'Information Overload', 'Information Overload',
 'Agent did not tailor their responses to match the specific query and included irrelevant details. For instance, when the client asked about the profit target for Stellar, the agent provided profit targets for all of FundedNext''s challenges, which was unnecessary.', 40),

('Minor Error', 'minor', 7.5, 'Inadequate/Excessive Engagement', 'Overcomplication of Responses',
 'Agent offered accurate yet unclear and complicated explanations that clients might struggle to comprehend.', 41),

('Minor Error', 'minor', 7.5, 'Inadequate/Excessive Engagement', 'Inadequate/Excessive Engagement',
 'Balancing customer interaction is crucial, as agents should provide an appropriate level of engagement, neither giving too little assistance, which can leave customers unsatisfied, nor overwhelming them with excessive interaction.', 42),

('Minor Error', 'minor', 7.5, 'Inadequate/Excessive Engagement', 'Overutilization of ChatGPT/Automation Tools',
 'Agent did not maintain a personalized tone in responses to avoid coming across as overly robotic or driven by AI. For example, using more natural, human-like phrasing is preferred over stiff, automated-sounding wording.', 43),

('Minor Error', 'minor', 7.5, 'Missing Minimal Information', 'Missing Minimal Information',
 'Agent offered accurate information but failed to provide sufficient context and a detailed explanation, which could result in the client not being fully informed.', 44),

('Minor Error', 'minor', 7.5, 'Grammatical Errors', 'Grammatical Mistakes',
 'Instances where the agent commits grammatical errors in their responses.', 45),

('Minor Error', 'minor', 7.5, 'Grammatical Errors', 'Spelling Mistakes',
 'Instances where the agent commits spelling errors in their responses.', 46),

('Minor Error', 'minor', 7.5, 'Grammatical Errors', 'Typos',
 'Instances where the agent commits typographical errors in their responses.', 47);

COMMIT;

-- ------------------------------------------------------------
-- 4. Rebuild agent_qc_summary with new severity labels
--    (DROP first — CREATE OR REPLACE cannot rename existing view columns)
-- ------------------------------------------------------------
DROP VIEW IF EXISTS agent_qc_summary;

CREATE VIEW agent_qc_summary AS
SELECT
  a.id AS agent_id,
  a.name AS agent_name,
  i.name AS inbox_name,
  COUNT(c.id) AS total_conversations,

  ROUND(AVG(c.qc_score), 2) AS avg_qc_score,
  MIN(c.qc_score) AS min_qc_score,
  MAX(c.qc_score) AS max_qc_score,

  COUNT(CASE WHEN c.cx_score = 1 THEN 1 END) AS cx_1_count,
  COUNT(CASE WHEN c.cx_score = 2 THEN 1 END) AS cx_2_count,
  COUNT(CASE WHEN c.cx_score = 3 THEN 1 END) AS cx_3_count,
  COUNT(CASE WHEN c.cx_score = 4 THEN 1 END) AS cx_4_count,
  COUNT(CASE WHEN c.cx_score = 5 THEN 1 END) AS cx_5_count,

  COUNT(CASE WHEN c.review_status = 'auto_approved' THEN 1 END) AS auto_approved_count,
  COUNT(CASE WHEN c.review_status = 'pending_review' THEN 1 END) AS pending_review_count,
  COUNT(CASE WHEN c.review_status = 'reviewed' THEN 1 END) AS reviewed_count,

  COALESCE(err_stats.critical_fail_count, 0) AS critical_fail_count,
  COALESCE(err_stats.major_count, 0) AS major_count,
  COALESCE(err_stats.significant_count, 0) AS significant_count,
  COALESCE(err_stats.minor_count, 0) AS minor_count

FROM agents a
LEFT JOIN conversations c ON c.agent_id = a.id
LEFT JOIN inboxes i ON c.inbox_id = i.id
LEFT JOIN LATERAL (
  SELECT
    COUNT(CASE WHEN qe.severity = 'critical_fail' THEN 1 END) AS critical_fail_count,
    COUNT(CASE WHEN qe.severity = 'major' THEN 1 END) AS major_count,
    COUNT(CASE WHEN qe.severity = 'significant' THEN 1 END) AS significant_count,
    COUNT(CASE WHEN qe.severity = 'minor' THEN 1 END) AS minor_count
  FROM qc_assessments qa
  JOIN qc_errors qe ON qe.assessment_id = qa.id
  WHERE qa.conversation_id = c.id
) err_stats ON TRUE
WHERE a.is_active = TRUE
GROUP BY a.id, a.name, i.name, err_stats.critical_fail_count, err_stats.major_count, err_stats.significant_count, err_stats.minor_count;

-- Verify:
--   SELECT severity, deduction, COUNT(*) FROM scoring_categories GROUP BY 1,2 ORDER BY 2 DESC;
--   -> critical_fail/50=4, major/20=12, significant/15=2, minor/7.5=8   (26 total)
