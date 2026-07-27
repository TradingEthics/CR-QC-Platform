-- ============================================================
-- CR QC Platform — Supabase Schema Migration
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE review_status AS ENUM (
  'pending_scoring',   -- Ingested, not yet scored by AI
  'auto_approved',     -- CX Score 3-5, AI scored, no manual review needed
  'pending_review',    -- CX Score 1-2, waiting for manual review
  'in_review',         -- Manual reviewer has claimed this
  'reviewed'           -- Manual review completed
);

CREATE TYPE error_severity AS ENUM (
  'critical_fail',     -- 50-point deduction
  'major',             -- 20-point deduction
  'significant',       -- 15-point deduction
  'minor'              -- 7.5-point deduction
);

CREATE TYPE scoring_provider AS ENUM (
  'gemini',
  'kimi',
  'manual'
);

CREATE TYPE author_type AS ENUM (
  'admin',
  'bot',
  'user'
);

-- ============================================================
-- CORE TABLES
-- ============================================================

-- 12 CR Inboxes from Intercom
CREATE TABLE inboxes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  intercom_id     TEXT UNIQUE NOT NULL,       -- Intercom inbox/team ID
  name            TEXT NOT NULL,              -- Display name (e.g., "CR General", "CR Escalations")
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- CR Agents (populated from Intercom admins)
CREATE TABLE agents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  intercom_id     TEXT UNIQUE NOT NULL,       -- Intercom admin ID
  name            TEXT NOT NULL,
  email           TEXT,
  avatar_url      TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Conversations ingested from Intercom
CREATE TABLE conversations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  intercom_id     TEXT UNIQUE NOT NULL,       -- Intercom conversation ID
  inbox_id        UUID REFERENCES inboxes(id),
  agent_id        UUID REFERENCES agents(id), -- Primary assigned agent
  
  -- From Intercom
  cx_score        SMALLINT CHECK (cx_score BETWEEN 1 AND 5),  -- CSAT rating from Intercom
  customer_name   TEXT,
  customer_email  TEXT,
  subject         TEXT,                       -- Conversation title/subject
  
  -- Computed by our system
  qc_score        NUMERIC(5,2),              -- Final QC score (0-100)
  review_status   review_status DEFAULT 'pending_scoring',
  
  -- Metadata
  intercom_created_at  TIMESTAMPTZ,          -- When conversation was created in Intercom
  intercom_updated_at  TIMESTAMPTZ,          -- When conversation was last updated in Intercom
  admin_reply_count    INTEGER DEFAULT 0,    -- Human-agent replies only (excludes Fin AI/bots)
  total_parts_count    INTEGER DEFAULT 0,    -- Total conversation parts
  intercom_url         TEXT,                 -- Clickable link to the conversation for manual review

  -- Sync tracking
  last_synced_at  TIMESTAMPTZ DEFAULT NOW(),
  
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Individual conversation parts (messages within a conversation)
CREATE TABLE conversation_parts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  intercom_part_id TEXT,                      -- Intercom part ID
  
  author_type     author_type NOT NULL,       -- 'admin', 'bot', or 'user'
  author_id       TEXT,                       -- Intercom author ID
  agent_id        UUID REFERENCES agents(id), -- Only populated if author_type = 'admin'
  
  body_text       TEXT,                       -- Plain text content (HTML stripped)
  body_html       TEXT,                       -- Original HTML content
  part_type       TEXT,                       -- 'comment', 'note', 'assignment', etc.
  
  sequence_order  INTEGER NOT NULL,           -- Order within conversation
  
  intercom_created_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- QC SCORING TABLES
-- ============================================================

-- QC Rubric categories (seeded from scorecard)
CREATE TABLE scoring_categories (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  section         TEXT NOT NULL,              -- 'Critical Fail', 'Major Error', 'Significant Error', 'Minor Error'
  severity        error_severity NOT NULL,
  deduction       NUMERIC(5,2) NOT NULL,     -- Points to deduct (50 / 20 / 15 / 7.5)
  error_type      TEXT NOT NULL,              -- 'Incorrect Information', etc.
  error_subtype   TEXT,                       -- More specific classification
  description     TEXT NOT NULL,              -- Full definition for AI prompt
  is_active       BOOLEAN DEFAULT TRUE,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Scoring batch run tracking (must be before qc_assessments due to FK)
CREATE TABLE scoring_runs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  
  conversations_scored INTEGER DEFAULT 0,
  conversations_failed INTEGER DEFAULT 0,
  avg_score       NUMERIC(5,2),
  
  provider        scoring_provider,
  model_name      TEXT,
  
  error_log       JSONB DEFAULT '[]',
  
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- AI-generated QC assessment per conversation
CREATE TABLE qc_assessments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  
  -- Score
  total_deductions NUMERIC(5,2) DEFAULT 0,   -- Sum of all error deductions
  final_score      NUMERIC(5,2) NOT NULL,    -- max(0, 100 - total_deductions)
  
  -- AI metadata
  provider        scoring_provider NOT NULL,  -- Which model scored this
  model_name      TEXT,                       -- e.g., 'gemini-3.6-flash'
  ai_reasoning    TEXT,                       -- Overall AI explanation
  prompt_tokens   INTEGER,
  completion_tokens INTEGER,
  latency_ms      INTEGER,                   -- Scoring time
  
  -- Tracking
  scoring_run_id  UUID REFERENCES scoring_runs(id),
  scored_at       TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Individual errors detected by AI
CREATE TABLE qc_errors (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assessment_id   UUID NOT NULL REFERENCES qc_assessments(id) ON DELETE CASCADE,
  category_id     UUID NOT NULL REFERENCES scoring_categories(id),
  conversation_part_id UUID REFERENCES conversation_parts(id), -- Which specific reply has the error
  
  severity        error_severity NOT NULL,
  deduction       NUMERIC(5,2) NOT NULL,
  
  ai_explanation  TEXT,                       -- AI's reasoning for flagging this error
  evidence_quote  TEXT,                       -- The specific text that triggered the error
  
  -- Manual override
  is_overridden   BOOLEAN DEFAULT FALSE,
  override_reason TEXT,
  overridden_by   UUID,                       -- reviewer's user ID
  overridden_at   TIMESTAMPTZ,
  
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MANUAL REVIEW TABLES
-- ============================================================

-- Manual review records (for CX 1-2 conversations)
CREATE TABLE manual_reviews (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  assessment_id   UUID REFERENCES qc_assessments(id),
  
  reviewer_id     UUID,                       -- Auth user ID of reviewer
  reviewer_name   TEXT,
  reviewer_email  TEXT,
  
  -- Review outcome
  original_qc_score  NUMERIC(5,2),           -- AI-generated score before review
  final_qc_score     NUMERIC(5,2),           -- Score after manual review
  
  review_notes    TEXT,                       -- Reviewer's comments
  errors_added    JSONB DEFAULT '[]',        -- Errors reviewer added that AI missed
  errors_removed  JSONB DEFAULT '[]',        -- AI errors reviewer dismissed
  
  -- Timing
  claimed_at      TIMESTAMPTZ,               -- When reviewer started
  completed_at    TIMESTAMPTZ,               -- When review was done
  
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- OPERATIONAL TABLES
-- ============================================================

-- Sync state tracking (last sync timestamp per inbox)
CREATE TABLE sync_state (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inbox_id        UUID REFERENCES inboxes(id),
  last_synced_at  TIMESTAMPTZ,
  last_conversation_updated_at TIMESTAMPTZ,  -- Cursor for incremental sync
  conversations_synced INTEGER DEFAULT 0,
  
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(inbox_id)
);

-- ============================================================
-- SUMMARY VIEW (for the agent summary table UI)
-- ============================================================

CREATE OR REPLACE VIEW agent_qc_summary AS
SELECT
  a.id AS agent_id,
  a.name AS agent_name,
  i.name AS inbox_name,
  COUNT(c.id) AS total_conversations,
  
  -- QC Score stats
  ROUND(AVG(c.qc_score), 2) AS avg_qc_score,
  MIN(c.qc_score) AS min_qc_score,
  MAX(c.qc_score) AS max_qc_score,
  
  -- CX Score distribution
  COUNT(CASE WHEN c.cx_score = 1 THEN 1 END) AS cx_1_count,
  COUNT(CASE WHEN c.cx_score = 2 THEN 1 END) AS cx_2_count,
  COUNT(CASE WHEN c.cx_score = 3 THEN 1 END) AS cx_3_count,
  COUNT(CASE WHEN c.cx_score = 4 THEN 1 END) AS cx_4_count,
  COUNT(CASE WHEN c.cx_score = 5 THEN 1 END) AS cx_5_count,
  
  -- Review status counts
  COUNT(CASE WHEN c.review_status = 'auto_approved' THEN 1 END) AS auto_approved_count,
  COUNT(CASE WHEN c.review_status = 'pending_review' THEN 1 END) AS pending_review_count,
  COUNT(CASE WHEN c.review_status = 'reviewed' THEN 1 END) AS reviewed_count,
  
  -- Error severity counts (from most recent assessment)
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

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_conversations_inbox_date ON conversations(inbox_id, intercom_created_at DESC);
CREATE INDEX idx_conversations_agent_status ON conversations(agent_id, review_status);
CREATE INDEX idx_conversations_cx_score ON conversations(cx_score);
CREATE INDEX idx_conversations_qc_score ON conversations(qc_score);
CREATE INDEX idx_conversations_review_status ON conversations(review_status);
CREATE INDEX idx_conversations_intercom_id ON conversations(intercom_id);

CREATE INDEX idx_conv_parts_conversation ON conversation_parts(conversation_id, sequence_order);
CREATE INDEX idx_conv_parts_author ON conversation_parts(author_type, agent_id);

CREATE INDEX idx_qc_assessments_conversation ON qc_assessments(conversation_id);
CREATE INDEX idx_qc_errors_assessment ON qc_errors(assessment_id);
CREATE INDEX idx_qc_errors_category ON qc_errors(category_id);

CREATE INDEX idx_manual_reviews_conversation ON manual_reviews(conversation_id);
CREATE INDEX idx_manual_reviews_reviewer ON manual_reviews(reviewer_id);

CREATE INDEX idx_sync_state_inbox ON sync_state(inbox_id);

-- ============================================================
-- ROW LEVEL SECURITY (basic — expand during frontend build)
-- ============================================================

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE qc_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE qc_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_reviews ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all data
CREATE POLICY "Authenticated users can read conversations"
  ON conversations FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "Authenticated users can read conversation parts"
  ON conversation_parts FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "Authenticated users can read assessments"
  ON qc_assessments FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "Authenticated users can read errors"
  ON qc_errors FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "Authenticated users can manage reviews"
  ON manual_reviews FOR ALL
  TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

-- Service role bypass for Python workers
-- (Supabase service_role key bypasses RLS by default)

-- ============================================================
-- SEED: QC Scoring Categories (from scorecard)
-- ============================================================

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

-- ============================================================
-- TRIGGER: Auto-update updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_conversations_updated
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_inboxes_updated
  BEFORE UPDATE ON inboxes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_agents_updated
  BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_sync_state_updated
  BEFORE UPDATE ON sync_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
