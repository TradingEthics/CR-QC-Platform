# Business Requirements Document (BRD)
# CR QC Platform — Case Resolution Quality Control System

**Document Version:** 1.0  
**Created:** July 8, 2026  
**Last Updated:** July 8, 2026  
**Author:** Sakib, NextVentures  
**Project Deadline:** August 15, 2026  
**Status:** Approved for Development  

---

## Table of Contents

1. Executive Summary
2. Business Context & Problem Statement
3. Business Objectives & Success Metrics
4. Stakeholders & Roles
5. Scope Definition
6. Glossary of Terms
7. System Overview & Architecture
8. Functional Requirements
9. QC Scoring Model (Complete Specification)
10. Data Requirements & Schema
11. Integration Requirements
12. User Interface Requirements
13. Workflow Specifications
14. Non-Functional Requirements
15. Deployment & Infrastructure
16. Assumptions & Dependencies
17. Risks & Mitigations
18. Acceptance Criteria
19. Appendices

---

## 1. Executive Summary

The CR QC Platform is an internal quality control system for FundedNext's Case Resolution (CR) team. The platform automates approximately 80% of QC reviews using AI-powered scoring against a structured 26-category rubric, while routing the remaining 20% (low-satisfaction conversations) to human reviewers for manual evaluation.

The system ingests customer support conversations from 12 Intercom inboxes, extracts agent (admin) replies, scores them against the QC rubric using LLM-as-judge pattern via Groq and OpenRouter APIs, calculates deduction-based QC scores, and presents results through a web dashboard with agent performance summaries, conversation drilldowns, and a manual review queue.

This is a standalone application, separate from the existing NextVentures Ops Dashboard.

---

## 2. Business Context & Problem Statement

### 2.1 Background

FundedNext is a proprietary trading firm that offers funded trading accounts. The Case Resolution (CR) team handles customer support communications through Intercom across 12 dedicated inboxes. These inboxes cover different aspects of customer service including general inquiries, account issues, payment questions, escalations, and specialized support topics.

Currently, quality control of agent responses is performed entirely manually by QC reviewers using a spreadsheet-based scorecard. This process is:

- Time-consuming: Reviewing each conversation manually takes 5–10 minutes
- Inconsistent: Different reviewers may interpret the rubric differently
- Limited in coverage: Only a fraction of conversations can be reviewed
- Delayed: Feedback reaches agents days after the conversation occurred

### 2.2 Problem Statement

With approximately 500 conversations per day across 12 inboxes (and event-driven volumes reaching 4,000–6,000+ during peak periods), the manual QC process cannot scale. The CR team needs a system that can automatically evaluate the majority of conversations while focusing human attention on the cases that need it most — specifically, conversations where customers gave low satisfaction ratings (CX Score 1 or 2 out of 5).

### 2.3 Solution

Build an AI-powered QC platform that:

1. Automatically ingests all conversations from 12 Intercom CR inboxes
2. Extracts and isolates agent (admin) replies from each conversation
3. Scores each conversation against 26 QC error categories using AI
4. Calculates a deduction-based QC score (starting from 100)
5. Auto-approves conversations with CX Score 3, 4, or 5
6. Routes conversations with CX Score 1 or 2 to a manual review queue
7. Provides a dashboard for monitoring agent performance and reviewing flagged conversations

---

## 3. Business Objectives & Success Metrics

### 3.1 Primary Objectives

| ID | Objective | Measure |
|----|-----------|---------|
| OBJ-1 | Automate 80% of QC reviews | ≥80% of conversations scored by AI without manual intervention |
| OBJ-2 | Reduce QC review time | Average review time per conversation reduced by 60% |
| OBJ-3 | Increase QC coverage | 100% of conversations receive a QC score (vs. partial coverage today) |
| OBJ-4 | Maintain scoring accuracy | AI scores agree with manual QC within ±10 points on 80%+ of conversations |
| OBJ-5 | Deliver by August 15, 2026 | Platform deployed and operational by deadline |

### 3.2 Secondary Objectives

| ID | Objective | Measure |
|----|-----------|---------|
| OBJ-6 | Enable agent coaching | Per-agent error pattern reports available for team leads |
| OBJ-7 | Zero ongoing AI costs | All AI scoring uses free-tier APIs (Groq + OpenRouter) |
| OBJ-8 | Real-time visibility | Dashboard reflects new conversations within 4 hours of closure |

---

## 4. Stakeholders & Roles

### 4.1 Project Stakeholders

| Role | Description | Responsibilities |
|------|-------------|------------------|
| Project Owner | Sakib (NextVentures) | Architecture decisions, development, deployment |
| QC Reviewers | CR QC team members | Manual review of CX 1-2 conversations, score overrides |
| Team Leads | CR team supervisors | View agent performance, use data for coaching |
| CR Agents | Customer support agents | Subject of QC scoring (not direct users of the platform) |

### 4.2 System User Roles

| Role | Access Level | Capabilities |
|------|-------------|--------------|
| Admin | Full access | All features, system configuration, manage users |
| Reviewer | Review access | View all conversations, perform manual reviews, override scores |
| Viewer | Read-only | View dashboard, summary tables, agent profiles (no review capability) |

All users must authenticate via Google OAuth restricted to the @nextventures.io email domain.

---

## 5. Scope Definition

### 5.1 In Scope

- Ingestion of conversations from 12 Intercom CR inboxes
- Extraction of admin (agent) replies from conversation parts
- AI-powered QC scoring against 26 error categories in 4 severity tiers
- Deduction-based scoring model (100-point scale)
- CX Score-based routing (1-2 → manual review, 3-5 → auto-approve)
- Web dashboard with summary table, conversation drilldown, agent profiles
- Manual review queue with score override capability
- Filtering by inbox, agent, date range, CX Score, QC Score, review status
- CSV/Excel export of summary data and individual reports
- Automated data sync (cron-based, every 4 hours)
- Automated AI scoring of new conversations
- Incremental sync (only fetch new/updated conversations)

### 5.2 Out of Scope

- Real-time scoring (conversations are scored in batch, not live)
- Integration with the existing NextVentures Ops Dashboard (this is a standalone app)
- RAG (Retrieval-Augmented Generation) against SOP templates
- Scoring of bot (FIN AI) responses — only admin (human agent) replies are scored
- Customer-facing features — this is an internal tool only
- Training or fine-tuning custom ML models (we use pre-trained LLMs via API)
- Mobile-native app — web-based only (responsive design for mobile browsers)
- Multi-language support — English only
- Historical backfill beyond what the initial full sync captures

---

## 6. Glossary of Terms

| Term | Definition |
|------|-----------|
| **Admin Reply** | A message in an Intercom conversation authored by a human agent (author.type = "admin"). This is what we QC score. |
| **Bot Reply** | A message authored by Intercom's FIN AI or automation (author.type = "bot"). Not scored. |
| **CX Score** | Customer Experience Score. A 1-5 rating given by the customer at the end of a conversation via Intercom's CSAT feature. 1 = very dissatisfied, 5 = very satisfied. This score already exists in Intercom; we do not generate it. |
| **QC Score** | Quality Control Score. A 0-100 score generated by our system. Starts at 100, with points deducted for each error found. Higher = better quality. |
| **Conversation** | A complete Intercom conversation thread between a customer and one or more agents. Contains multiple "parts" (individual messages). |
| **Conversation Part** | A single message within a conversation. Has an author (admin, bot, or user), body text, and timestamp. |
| **Inbox** | An Intercom team inbox. The CR team has 12 inboxes, each handling different types of customer issues. |
| **Error Category** | One of 26 specific quality issues defined in the QC scorecard. Each has a severity level and point deduction value. |
| **Severity Tier** | One of 4 levels: Critical Fail (−50), Critical Error (−15), Significant Error (−15), Major Error (−7.5). |
| **Auto-Approved** | A conversation with CX Score 3-5 that has been AI-scored and does not require manual review. |
| **Pending Review** | A conversation with CX Score 1-2 that has been AI-scored but is waiting for a human reviewer to verify. |
| **Manual Review** | The process where a human reviewer examines a conversation, verifies or overrides AI-detected errors, and confirms the final QC score. |
| **Deduction** | Points subtracted from the starting score of 100 for each error detected. |
| **LLM-as-Judge** | The pattern of using a Large Language Model to evaluate text quality against a rubric, rather than using traditional ML classifiers. |
| **Groq** | Primary AI inference provider. Hosts Llama 3.3 70B model with a free tier. |
| **OpenRouter** | Backup AI inference provider. Aggregates multiple free models (Gemma, Nemotron, GPT-OSS). |
| **FundedNext** | The proprietary trading firm whose customer support is being QC'd. The correct branding is always "FundedNext" (capital F, capital N, one word). |

---

## 7. System Overview & Architecture

### 7.1 High-Level Architecture

The system consists of three layers:

**Layer 1 — Data Ingestion (Python)**
A Python worker that runs on a scheduled cron (every 4 hours). It connects to the Intercom REST API, fetches conversations from all 12 CR inboxes, extracts conversation parts (separating admin, bot, and user messages), parses CX Score and metadata, and writes everything to Supabase PostgreSQL.

**Layer 2 — AI Scoring Engine (Python)**
A Python worker that picks up unscored conversations from the database, constructs a scoring prompt containing the conversation thread and the full 26-category QC rubric, sends it to Groq (primary) or OpenRouter (fallback), parses the structured JSON response to extract detected errors and reasoning, calculates the final QC score (100 minus sum of deductions), and updates the conversation with its score and review status routing.

**Layer 3 — Web Dashboard (Next.js)**
A Next.js web application deployed on Vercel. Provides authenticated access to the agent summary table, conversation drilldown, agent profile pages, manual review queue, and filtering/export features.

### 7.2 Data Flow

```
[Intercom] ──(REST API)──▶ [Python Ingestion Worker]
                                    │
                                    ▼
                              [Supabase DB]
                                    │
                                    ▼
                          [Python Scoring Worker]
                           │                  │
                     [Groq API]        [OpenRouter API]
                     (Primary)          (Fallback)
                           │                  │
                           ▼                  ▼
                    [Structured QC Scores]
                                    │
                                    ▼
                              [Supabase DB]
                                    │
                                    ▼
                          [Next.js Dashboard]
                                    │
                           ┌───────┴────────┐
                           │                │
                    [Auto-Approved]   [Manual Review Queue]
                    (CX Score 3-5)   (CX Score 1-2)
```

### 7.3 Technology Stack

| Component | Technology | Reason |
|-----------|-----------|--------|
| Database | Supabase (PostgreSQL) | Free tier, built-in auth, real-time, REST API |
| Backend Workers | Python 3.11+ | Fast iteration, great HTTP libraries, ML ecosystem |
| HTTP Client | httpx (async) | Async support for concurrent API calls |
| AI Primary | Groq (Llama 3.3 70B Instruct) | Free tier ~6,000 req/day, fast inference |
| AI Fallback | OpenRouter (Gemma 4 31B, Nemotron 3 120B, GPT-OSS 120B) | Free tier 200 req/day per model, model rotation |
| Frontend | Next.js 16 + Turbopack | Team's existing expertise, fast development |
| UI Components | shadcn/ui | Consistent, accessible, customizable components |
| Charts | Recharts | Already used in ops-dashboard, React-native charts |
| Auth | NextAuth (Google OAuth) | Restrict to @nextventures.io domain |
| Hosting | Vercel Hobby Plan | Free, auto-deploy from GitHub, serverless |
| Cron Scheduling | Render Free Tier or Vercel Cron | Schedule ingestion + scoring workers |
| HTML Parsing | html2text (Python) | Convert Intercom HTML replies to plain text |
| Retry Logic | tenacity (Python) | Exponential backoff for API rate limits |

---

## 8. Functional Requirements

### FR-1: Data Ingestion

#### FR-1.1: Intercom Conversation Sync

The system MUST connect to the Intercom REST API and fetch conversations from all 12 CR inboxes. The system MUST support two sync modes:

- **Full Sync:** Fetches all conversations from all inboxes. Used for the initial data load.
- **Incremental Sync:** Fetches only conversations updated since the last sync timestamp. Used for scheduled runs.

The system MUST handle Intercom's cursor-based pagination (50 conversations per page) and MUST respect Intercom's rate limits (~83 requests per 10 seconds) using the `X-RateLimit-Remaining` response header with exponential backoff.

The system MUST track the last sync timestamp per inbox in a `sync_state` table so that each inbox syncs independently.

#### FR-1.2: Conversation Part Extraction

For each conversation, the system MUST fetch the full conversation including all parts (individual messages). Each part has an author with a type field:

- `"admin"` → Human agent reply. **This is what we QC score.**
- `"bot"` → FIN AI or automation reply. Stored but NOT scored.
- `"user"` → Customer message. Stored for context but NOT scored.

The system MUST store all parts in chronological order (sequence_order field) to preserve the conversation flow.

The system MUST convert HTML body content to plain text for AI scoring, while preserving the original HTML for display in the dashboard.

#### FR-1.3: Agent and Inbox Sync

The system MUST fetch and store all Intercom admins (agents) with their ID, name, email, and avatar URL. The system MUST fetch and store all Intercom teams (inboxes) with their ID and name.

These are upserted (update if exists, insert if new) on every sync run to keep agent and inbox data current.

#### FR-1.4: CX Score Extraction

The system MUST extract the CX Score (1-5 customer satisfaction rating) from each conversation. The primary location is `conversation_rating.rating` in the Intercom API response. If not found there, the system MUST check `custom_attributes` for a `cx_score` field as a fallback.

Conversations without a CX Score are still ingested and scored by AI but are treated as auto-approved (no manual review required) unless otherwise configured.

#### FR-1.5: Deduplication

The system MUST use the Intercom conversation ID as a unique identifier. If a conversation already exists in the database, the system MUST update its metadata (CX score, timestamps, parts) rather than creating a duplicate. The system MUST NOT overwrite the `review_status` if it is `in_review` or `reviewed` (to protect ongoing or completed manual reviews).

---

### FR-2: AI Scoring Engine

#### FR-2.1: Scoring Input

For each unscored conversation, the system MUST construct a scoring prompt that includes:

1. The full conversation thread in chronological order, with each message labeled by author type (Customer, Agent, Bot)
2. The complete QC rubric with all 26 error categories, their severity levels, deduction values, and detailed descriptions
3. Instructions to evaluate ONLY the agent (admin) replies
4. Instructions to return a structured JSON response

#### FR-2.2: Scoring Output (Expected AI Response Format)

The AI MUST return a JSON response with this structure:

```json
{
  "conversation_id": "string",
  "errors_found": [
    {
      "category": "string (matching a scoring_categories.error_subtype or error_type)",
      "severity": "critical_fail | critical | significant | major",
      "deduction": 50 | 15 | 7.5,
      "reply_index": 0,
      "evidence_quote": "The specific text from the agent reply that contains the error",
      "explanation": "Why this is an error and which rubric criteria it violates"
    }
  ],
  "overall_reasoning": "Summary of the conversation quality and key issues found",
  "total_deductions": 0.0,
  "final_score": 100.0
}
```

If no errors are found, `errors_found` MUST be an empty array and `final_score` MUST be 100.

#### FR-2.3: Score Calculation

The QC Score is calculated as:

```
QC Score = max(0, 100 - sum(all error deductions))
```

The minimum possible score is 0. There is no maximum cap on deductions (a conversation with multiple critical fails could theoretically have 150+ points of deductions, but the score floors at 0).

Multiple errors of the same category in the same conversation each count as a separate deduction. For example, if an agent makes two different grammatical errors, that is 2 × 15 = 30 points deducted under the "Significant Error" tier.

#### FR-2.4: Review Status Routing

After scoring, the system MUST set the conversation's `review_status` based on CX Score:

| CX Score | Review Status | Meaning |
|----------|--------------|---------|
| 1 | `pending_review` | Goes to manual review queue |
| 2 | `pending_review` | Goes to manual review queue |
| 3 | `auto_approved` | No manual review needed |
| 4 | `auto_approved` | No manual review needed |
| 5 | `auto_approved` | No manual review needed |
| NULL (no rating) | `auto_approved` | Default to auto-approved |

#### FR-2.5: AI Provider Strategy

**Primary Provider: Groq**
- Model: `llama-3.3-70b-versatile`
- Free tier: approximately 6,000 requests/day, 30 requests/minute
- Used for all scoring attempts first

**Fallback Provider: OpenRouter**
- Models rotated in order:
  1. `google/gemma-4-31b-it:free` (quality rank #1 on OpenRouter)
  2. `nvidia/nemotron-3-super-120b-a12b:free`
  3. `openai/gpt-oss-120b:free`
- Free tier: 200 requests/day per model = ~600/day across 3 models
- Used when Groq returns a rate limit error (HTTP 429) or is unavailable

**Combined daily capacity: ~6,600 requests.** For 500 conversations/day with up to 2 retries each, this is sufficient.

The system MUST log which provider and model scored each conversation for auditability.

#### FR-2.6: Batch Processing

The scoring worker MUST process conversations in configurable batches (default: 10). Between batches, the system MUST pause to respect rate limits. The system MUST track each scoring run in the `scoring_runs` table with:

- Start and end timestamps
- Count of conversations scored and failed
- Average score for the batch
- Provider and model used
- Error log for any failures

#### FR-2.7: Error Handling and Retries

If the AI returns an unparseable response (not valid JSON), the system MUST retry up to 3 times with exponential backoff. If all retries fail, the conversation MUST remain in `pending_scoring` status and the failure MUST be logged in the scoring run's error log.

The system MUST NOT mark a conversation as scored if the AI response could not be parsed.

---

### FR-3: Web Dashboard

#### FR-3.1: Authentication

The dashboard MUST require Google OAuth sign-in. Only users with @nextventures.io email addresses MUST be allowed to access the application. Unauthenticated users MUST be redirected to the login page.

#### FR-3.2: Agent Summary Table (Main View)

This is the primary landing page after login. It displays a table where each row represents one agent and columns show their QC performance metrics.

**Required Columns:**

| Column | Data | Source |
|--------|------|--------|
| Agent Name | Agent's full name | agents.name |
| Total Conversations | Count of all scored conversations | COUNT(conversations) per agent |
| Avg QC Score | Average QC score across all their conversations | AVG(conversations.qc_score) per agent |
| Min QC Score | Lowest QC score | MIN(conversations.qc_score) per agent |
| Max QC Score | Highest QC score | MAX(conversations.qc_score) per agent |
| CX 1 Count | Number of conversations with CX Score 1 | COUNT WHERE cx_score = 1 |
| CX 2 Count | Number of conversations with CX Score 2 | COUNT WHERE cx_score = 2 |
| CX 3 Count | Number of conversations with CX Score 3 | COUNT WHERE cx_score = 3 |
| CX 4 Count | Number of conversations with CX Score 4 | COUNT WHERE cx_score = 4 |
| CX 5 Count | Number of conversations with CX Score 5 | COUNT WHERE cx_score = 5 |
| Critical Fail Errors | Total critical fail errors across all conversations | COUNT WHERE severity = critical_fail |
| Critical Errors | Total critical errors | COUNT WHERE severity = critical |
| Significant Errors | Total significant errors | COUNT WHERE severity = significant |
| Major Errors | Total major errors | COUNT WHERE severity = major |
| Auto-Approved Count | Conversations auto-approved | COUNT WHERE review_status = auto_approved |
| Pending Review Count | Conversations awaiting review | COUNT WHERE review_status = pending_review |
| Reviewed Count | Conversations manually reviewed | COUNT WHERE review_status = reviewed |

**Color Coding:**
- QC Score ≥ 90: Green (good)
- QC Score 70–89: Yellow/Orange (warning)
- QC Score < 70: Red (needs attention)

**Interactions:**
- Click any column header to sort ascending/descending
- Click an agent row to navigate to their Agent Profile page
- All data respects the currently active filters

#### FR-3.3: Conversation Detail Page

Accessed by clicking a specific conversation from the agent profile or review queue. Shows the complete conversation with QC scoring overlay.

**Required Elements:**

Header section showing: conversation ID (linking to Intercom), agent name, inbox name, CX Score (with color badge), QC Score (with color badge), review status, conversation date.

Conversation thread showing all messages in chronological order. Customer messages displayed on the left side. Agent messages displayed on the right side, with a distinct background color. Bot messages displayed with a different styling (muted/gray). Each agent message shows the list of errors detected in that specific reply, if any.

Error detail panel (expandable per error) showing: error category name, severity level and deduction value, the specific quote from the agent's reply that triggered the error, the AI's explanation of why this is an error.

If the conversation has been manually reviewed, the page MUST also show: reviewer name and date, original AI score vs final reviewed score, any errors added or removed by the reviewer, and reviewer notes.

#### FR-3.4: Agent Profile Page

Shows an individual agent's QC performance over time.

**Required Elements:**

Agent header: name, email, avatar, total conversations scored.

Performance summary: average QC score, QC score trend over time (line chart showing weekly or daily averages), CX Score distribution (bar chart or breakdown of 1s through 5s).

Error analysis: most common error types for this agent (bar chart), error frequency by severity tier.

Conversation list: sortable table of all conversations for this agent with columns for date, subject/title, CX Score, QC Score, review status. Each row clickable to open the Conversation Detail page.

#### FR-3.5: Manual Review Queue

A dedicated page for QC reviewers to work through conversations with CX Score 1 or 2.

**Required Elements:**

Queue count header showing: "X conversations pending review | Y reviewed today | Z reviewed this week."

Queue list showing conversations with `review_status = 'pending_review'`, sorted by lowest QC Score first (worst conversations at the top). Each row shows: agent name, CX Score, AI QC Score, conversation date, subject preview, inbox name.

"Claim for Review" button on each row. When clicked: sets `review_status` to `in_review`, records the reviewer's identity and timestamp, opens the Conversation Detail page in review mode.

**Review Mode** (active when reviewer has claimed a conversation):

For each AI-detected error, the reviewer can:
- **Agree:** Confirm the error is valid (no change to score)
- **Dismiss:** Remove the error. A text input for the reason is required. The deduction is removed from the total.
- **Override:** Change the severity level of the error

The reviewer can **Add New Errors** that the AI missed:
- Select from a dropdown of all 26 error categories
- Provide an explanation
- The corresponding deduction is added to the total

After all adjustments, the system recalculates: `Final Score = max(0, 100 - sum(adjusted deductions))` and displays: "Original AI Score: X → Adjusted Score: Y."

A "Complete Review" button saves all changes:
- Creates a `manual_reviews` record with original score, final score, errors added, errors removed, and reviewer notes
- Sets `review_status` to `reviewed`
- Updates `conversations.qc_score` to the adjusted final score
- Removes the conversation from the pending queue

#### FR-3.6: Filters

All list views (Summary Table, Agent Profile conversation list, Review Queue) MUST support filtering by:

| Filter | Type | Behavior |
|--------|------|----------|
| Inbox | Multi-select dropdown | Show only conversations from selected inbox(es) |
| Agent | Multi-select dropdown | Show only conversations handled by selected agent(s) |
| Date Range | Start date + End date pickers | Show conversations within the date range (based on intercom_created_at) |
| CX Score | Checkbox group (1, 2, 3, 4, 5) | Show only conversations with selected CX Score(s) |
| QC Score Range | Min/Max slider or inputs | Show conversations with QC Score within the specified range |
| Review Status | Checkbox group | Show only conversations with selected status(es) |

Filters MUST be combinable: selecting Inbox "CR General" + Agent "John" + CX Score "1, 2" + Date "Jul 1–Jul 15" shows only John's CX 1-2 conversations from CR General in that date range.

Active filters MUST be visually indicated and individually clearable. A "Clear All Filters" button MUST reset all filters.

#### FR-3.7: Export

The system MUST support exporting data as CSV files:

| Export | Available From | Contents |
|--------|---------------|----------|
| Agent Summary | Summary Table page | All agents with their metrics (respecting active filters) |
| Agent Conversations | Agent Profile page | All conversations for a specific agent with scores |
| Conversation Detail | Conversation Detail page | Full QC breakdown for a single conversation |
| Review Report | Review Queue page | All reviewed conversations with original vs adjusted scores |

Exports MUST respect currently active filters. Exported files MUST open correctly in both Microsoft Excel and Google Sheets.

---

## 9. QC Scoring Model (Complete Specification)

### 9.1 Scoring Methodology

Every conversation starts with a base score of **100 points**. For each quality error detected in the agent's replies, points are deducted based on the error's severity tier. The final QC Score is calculated as:

```
QC Score = max(0, 100 − Σ(deductions for all errors found))
```

Scores range from 0 (worst) to 100 (perfect). There is no rounding — scores retain up to 2 decimal places.

### 9.2 Severity Tiers

| Tier | Deduction per Error | Impact |
|------|-------------------|--------|
| Critical Fail | −50 points | A single critical fail drops the score to 50 or below. These are zero-tolerance errors. |
| Critical Error | −15 points | Serious quality issues. 2 critical errors = −30, dropping score to 70. |
| Significant Error | −15 points | Noticeable quality issues in language and grammar. |
| Major Error | −7.5 points | Minor issues that affect but do not severely compromise quality. |

### 9.3 Complete Error Category Reference (26 Categories)

#### 9.3.1 Critical Fail Errors (3 categories, −50 each)

**CF-01: Error Leading to Loss of Business**
- Section: Critical Fail
- Deduction: 50 points
- Definition: Agent provided incorrect information or behaved unprofessionally, which could result in a direct or potential loss of income. This also encompasses situations where agents provided inaccurate pricing information to clients or made payment-related mistakes impacting our company's profitability.
- What the AI should look for: Incorrect pricing or fee information, wrong account specifications, misleading claims about profit splits or payouts, errors that could cause a customer to lose money or leave FundedNext.

**CF-02: Non-Compliant Ticket/Email Closure**
- Section: Critical Fail (Zero Tolerance)
- Deduction: 50 points
- Definition: Agent abruptly closed an Email without providing any response to the client, an action considered unacceptable due to its substantial negative influence on both customer contentment and the company's reputation.
- What the AI should look for: Conversation closed with no agent reply at all, conversation closed mid-thread without resolution, ticket closed without addressing the customer's question.

**CF-03: Unauthorized Information Disclosure**
- Section: Critical Fail (Zero Tolerance)
- Deduction: 50 points
- Definition: Agent disclosed sensitive information like tool specifics, personal contact details, or restricted data to clients. Such behaviors are strictly forbidden because they pose potential security and privacy hazards.
- What the AI should look for: Sharing internal tool names or URLs, sharing personal phone numbers or emails of staff, disclosing internal processes or restricted business data, sharing other customer's information.

#### 9.3.2 Critical Errors (14 categories, −15 each)

**CE-01: Incorrect Information**
- Section: Critical Error
- Deduction: 15 points
- Definition: Ensure that all information shared with the client is accurate and consistent with FundedNext's policies, including rules, FAQs, and terms.
- What the AI should look for: Wrong policy information, incorrect rules about trading challenges, wrong FAQ answers, inconsistencies with FundedNext's published terms.

**CE-02: Incorrect FundedNext Branding**
- Section: Critical Error
- Deduction: 15 points
- Definition: Agent used incorrect FundedNext branding, including usage of capslock. Correct examples: FundedNext Account, FundedNext Challenge Account, Stellar Instant FundedNext Account, FundedNext Phase, Challenge Phase, Stellar 1-Step Account, Stellar Lite Account, Futures Challenge Account, Futures FundedNext Account, Phase 1 of FundedNext Challenge Account. Any misspellings or incorrect branding of FundedNext should be corrected immediately (e.g., "FundedNext" should always be capitalized correctly).
- What the AI should look for: "Fundednext" (lowercase n), "FUNDEDNEXT" (all caps), "Funded Next" (space), "FN" (abbreviation in customer-facing text), incorrect product names.

**CE-03: Context-Altering Spelling Errors**
- Section: Critical Error
- Deduction: 15 points
- Definition: If a spelling error substantially changes the meaning of the sentence, it will lead to a deduction. For instance, the difference between "HFT trading is not allowed" and "HFT trading is now allowed" can result in such deductions.
- What the AI should look for: Typos that change "not" to "now" or vice versa, misspellings that change the meaning of policy statements, errors that could mislead customers about what is or isn't permitted.

**CE-04: Inappropriate/Unprofessional Interaction**
- Section: Critical Error
- Deduction: 15 points
- Definition: Agent exhibited unprofessional conduct when dealing with clients, which encompassed behaviors like being impolite, using sarcasm, using abusive language, or adopting a condescending tone. These actions can have a substantial negative impact on the client's experience and the overall image of the support team.
- What the AI should look for: Rude or dismissive language, sarcastic remarks, condescending tone, blaming the customer, showing frustration or impatience.

**CE-05: Lack of Escalation**
- Section: Critical Error
- Deduction: 15 points
- Definition: Agent failed to escalate an issue that clearly requires attention or intervention from other stakeholders. This lack of escalation can result in prolonged resolution times, increased customer frustration, and a negative impact on customer satisfaction. Ensure proper escalation to relevant teams like Pro Support Team or Business Operations Team etc. when needed.
- What the AI should look for: Complex technical issues not escalated, payment disputes not escalated to finance, account issues requiring admin access not escalated, repeated customer contacts about the same unresolved issue.

**CE-06: Unnecessary Escalation**
- Section: Critical Error
- Deduction: 15 points
- Definition: Agent chose to escalate a case to other stakeholders even when they possessed the capability to resolve the issue independently. Unwarranted escalations can result in inefficiencies, increased workload for different departments, and delays in addressing legitimately pressing concerns. Double-check prior escalation history to avoid duplicate cases and unnecessary delays. Ensure the FundedNext platform's internal procedures are followed.
- What the AI should look for: Simple FAQ questions escalated, issues the agent clearly has the authority to resolve, escalations without first attempting resolution.

**CE-07: Incorrect Escalation Channel/Team Assignment**
- Section: Critical Error
- Deduction: 15 points
- Definition: Agent overlooked the specified criteria for escalation or mistakenly escalated the case to the wrong team, leading to delays in resolution and misallocation of resources.
- What the AI should look for: Payment issues sent to technical support, technical issues sent to billing, customer complaints sent to the wrong team.

**CE-08: Neglected Escalation History Verification**
- Section: Critical Error
- Deduction: 15 points
- Definition: Agent failed to review the prior escalation records, which resulted in the submission of a duplicate case to CR, RM, BDev, Finance, Pro Support, or Discord, leading to delays in resolving the matter.
- What the AI should look for: Creating duplicate tickets, not checking if the issue was already escalated, re-escalating a case that is already being handled.

**CE-09: Insufficient Information During Escalation**
- Section: Critical Error
- Deduction: 15 points
- Definition: Agent concluded an interaction and initiated a case escalation without providing the essential information needed to address the problem. This may lead to delays in resolving the issue, misallocation of resources within the relevant team, and has the potential to leave the client dissatisfied.
- What the AI should look for: Escalation notes without customer account details, escalation without describing the specific issue, escalation missing steps already taken.

**CE-10: Exaggerated Engagement**
- Section: Critical Error
- Deduction: 15 points
- Definition: If there is a situation where a double payment occurs, the agent proactively offered a refund without waiting for the client to raise the issue.
- What the AI should look for: Agent proactively offering refunds or credits the customer hasn't asked about, volunteering information about errors that could trigger refund requests.

**CE-11: Lack of Investigation**
- Section: Critical Error
- Deduction: 15 points
- Definition: The agent closed the ticket or email without thoroughly examining the client's concern while overlooking some important details. Verify that all client issues are thoroughly investigated before responding or escalating. Ensure that responses regarding accounts are factually correct and aligned with our rules.
- What the AI should look for: Generic responses to specific questions, not checking the customer's account before responding, closing a ticket without fully understanding the issue, surface-level answers to complex problems.

**CE-12: Apology Spiel Missing**
- Section: Critical Error
- Deduction: 15 points
- Definition: Agent didn't offer an apology tailored to the client's issue, particularly when the problem was caused by FundedNext. This includes situations like server errors, dashboard glitches, etc.
- What the AI should look for: Company-caused issues (server errors, platform bugs, processing delays) where the agent didn't apologize, situations where the customer is clearly frustrated by a FundedNext issue and the agent doesn't acknowledge fault.

**CE-13: Empathy Spiel Missing**
- Section: Critical Error
- Deduction: 15 points
- Definition: Agent failed to express any kind of empathy for any inconvenience the client is encountering, regardless of whether the issue originated from our end or not. This also includes instances where the agent doesn't integrate empathetic language to reassure the client that their concerns are acknowledged. Ensure empathy is conveyed when addressing client concerns related to their FundedNext Accounts.
- What the AI should look for: Jumping straight to the answer without acknowledging the customer's frustration, no empathetic phrases like "I understand your concern" or "I can see how this would be frustrating", robotic or transactional tone when the customer is expressing distress.

**CE-14: Mismatched Emotional Tone**
- Section: Critical Error
- Deduction: 15 points
- Definition: Instead of displaying an appropriate emotional tone that acknowledges the customer's feelings, agent's response might come across as indifferent, robotic, or even dismissive. Avoid using a tone that could be perceived as robotic or indifferent unless it's absolutely necessary; ensure a supportive approach, especially when dealing with evaluation accounts.
- What the AI should look for: Overly casual tone for a serious complaint, overly formal/robotic tone when warmth is needed, dismissive phrasing, tone that doesn't match the gravity of the customer's issue.

#### 9.3.3 Significant Errors (3 categories, −15 each)

**SE-01: Grammatical Mistakes**
- Section: Significant Error
- Deduction: 15 points
- Definition: Instances where the agent commits grammatical errors in their responses.
- What the AI should look for: Subject-verb disagreement, incorrect tense usage, sentence fragments, run-on sentences, incorrect pronoun usage, missing articles.

**SE-02: Spelling Mistakes**
- Section: Significant Error
- Deduction: 15 points
- Definition: Instances where the agent commits spelling errors in their responses.
- What the AI should look for: Misspelled words (excluding those covered by CE-02 branding errors and CE-03 context-altering errors), consistently misspelled common words.

**SE-03: Typos**
- Section: Significant Error
- Deduction: 15 points
- Definition: Instances where the agent commits typographical errors in their responses.
- What the AI should look for: Missing letters, extra letters, transposed letters, missing spaces, extra spaces, garbled text from copy-paste errors.

#### 9.3.4 Major Errors (7 categories, −7.5 each)

**ME-01: Missing Information**
- Section: Major Error
- Deduction: 7.5 points
- Definition: Agent provided a response that did not fully address all aspects of the client's query. When a client has multiple questions and the agent addresses most of them but misses one query, it's categorized as a missing information error.
- What the AI should look for: Customer asked 3 questions but only 2 were answered, key details omitted from the response, partial answers that leave the customer needing to follow up.

**ME-02: Outdated or Inadequate Macro Usage**
- Section: Major Error
- Deduction: 7.5 points
- Definition: Agent used a macro that needed editing, paraphrasing. Agent utilized an outdated macro that failed to adequately acknowledge or resolve the client's problem.
- What the AI should look for: Responses that look like unedited templates (placeholder text, generic greetings that don't match the context), macros that reference old policies or discontinued products, copy-pasted responses that don't fit the specific question.

**ME-03: Information Overload**
- Section: Major Error
- Deduction: 7.5 points
- Definition: Agent did not tailor their responses to match the specific query and included irrelevant details. For instance, when the client asked about the profit target for Stellar, the agent provided profit targets for all of FundedNext's challenges, which was unnecessary.
- What the AI should look for: Providing information about unrelated products or features, long responses to simple questions, dumping entire policy sections instead of answering the specific question.

**ME-04: Overcomplication of Responses**
- Section: Major Error
- Deduction: 7.5 points
- Definition: Agent offered accurate yet unclear and complicated explanations that clients might struggle to comprehend.
- What the AI should look for: Technical jargon without explanation, overly complex sentence structures, convoluted explanations when a simple one would suffice.

**ME-05: Inadequate/Excessive Engagement**
- Section: Major Error
- Deduction: 7.5 points
- Definition: Balancing customer interaction is crucial, as agents should provide an appropriate level of engagement, neither giving too little assistance, which can leave customers unsatisfied, nor overwhelming them with excessive interaction.
- What the AI should look for: One-word or extremely brief responses to complex issues, excessive back-and-forth when the issue could be resolved in fewer messages, agent providing too much unsolicited information.

**ME-06: Overutilization of ChatGPT/Automation Tools**
- Section: Major Error
- Deduction: 7.5 points
- Definition: Agent did not maintain a personalized tone in responses to avoid coming across as overly robotic or driven by AI. For example, using phrases like "Once you get the funded account and make your first withdrawal, on that withdrawal you will get the subscription fee refund" sounds more natural than "Upon receipt of the Funded account and request for the inaugural profit disbursement, you will be refunded your subscription fee."
- What the AI should look for: Overly formal or stilted language that doesn't match natural support conversation, use of uncommon words where simple ones would work (e.g., "inaugural" instead of "first", "disbursement" instead of "withdrawal"), responses that read like they were generated by ChatGPT without editing.

**ME-07: Missing Minimal Information**
- Section: Major Error
- Deduction: 7.5 points
- Definition: Agent offered accurate information but failed to provide sufficient context and a detailed explanation, which could result in the client not being fully informed.
- What the AI should look for: Correct answer but no explanation of why, stating a policy without context, answering "yes" or "no" without elaboration.

---

## 10. Data Requirements & Schema

### 10.1 Database: Supabase PostgreSQL

### 10.2 Complete Schema

#### Table: `inboxes`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Internal unique ID |
| intercom_id | TEXT | UNIQUE, NOT NULL | Intercom team/inbox ID |
| name | TEXT | NOT NULL | Display name (e.g., "CR General") |
| is_active | BOOLEAN | DEFAULT TRUE | Whether to include in syncs |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Record creation time |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Last update time (auto-trigger) |

#### Table: `agents`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Internal unique ID |
| intercom_id | TEXT | UNIQUE, NOT NULL | Intercom admin ID |
| name | TEXT | NOT NULL | Agent's full name |
| email | TEXT | | Agent's email address |
| avatar_url | TEXT | | URL to agent's profile picture |
| is_active | BOOLEAN | DEFAULT TRUE | Whether agent is currently active |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Record creation time |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Last update time (auto-trigger) |

#### Table: `conversations`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Internal unique ID |
| intercom_id | TEXT | UNIQUE, NOT NULL | Intercom conversation ID |
| inbox_id | UUID | FK → inboxes(id) | Which inbox this conversation belongs to |
| agent_id | UUID | FK → agents(id) | Primary assigned agent |
| cx_score | SMALLINT | CHECK 1-5 | Customer satisfaction rating from Intercom |
| customer_name | TEXT | | Customer's name |
| customer_email | TEXT | | Customer's email |
| subject | TEXT | | Conversation title/subject line |
| qc_score | NUMERIC(5,2) | | AI-generated or manually adjusted QC score (0-100) |
| review_status | ENUM | NOT NULL, DEFAULT 'pending_scoring' | One of: pending_scoring, auto_approved, pending_review, in_review, reviewed |
| intercom_created_at | TIMESTAMPTZ | | When conversation was created in Intercom |
| intercom_updated_at | TIMESTAMPTZ | | When conversation was last updated in Intercom |
| admin_reply_count | INTEGER | DEFAULT 0 | Number of admin (agent) replies in this conversation |
| total_parts_count | INTEGER | DEFAULT 0 | Total number of messages in the conversation |
| last_synced_at | TIMESTAMPTZ | DEFAULT NOW() | When this record was last synced from Intercom |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Record creation time |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Last update time (auto-trigger) |

#### Table: `conversation_parts`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Internal unique ID |
| conversation_id | UUID | FK → conversations(id), CASCADE DELETE | Parent conversation |
| intercom_part_id | TEXT | | Intercom's part ID |
| author_type | ENUM | NOT NULL | One of: admin, bot, user |
| author_id | TEXT | | Intercom author ID |
| agent_id | UUID | FK → agents(id) | Only populated when author_type = 'admin' |
| body_text | TEXT | | Plain text content (HTML stripped) — used for AI scoring |
| body_html | TEXT | | Original HTML content — used for dashboard display |
| part_type | TEXT | | Intercom part type: comment, note, assignment, etc. |
| sequence_order | INTEGER | NOT NULL | Chronological order within the conversation (0-based) |
| intercom_created_at | TIMESTAMPTZ | | When this message was sent |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Record creation time |

#### Table: `scoring_categories`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Internal unique ID |
| section | TEXT | NOT NULL | Tier name: "Critical Fail", "Critical Error", "Significant Error", "Major Error" |
| severity | ENUM | NOT NULL | One of: critical_fail, critical, significant, major |
| deduction | NUMERIC(5,2) | NOT NULL | Points deducted: 50, 15, or 7.5 |
| error_type | TEXT | NOT NULL | Category name (e.g., "Incorrect Information") |
| error_subtype | TEXT | | Specific subcategory (e.g., "Incorrect FundedNext Branding") |
| description | TEXT | NOT NULL | Full definition used in AI scoring prompt |
| is_active | BOOLEAN | DEFAULT TRUE | Whether this category is currently scored |
| sort_order | INTEGER | DEFAULT 0 | Display order in the UI |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Record creation time |

Pre-seeded with 26 rows matching the QC scorecard.

#### Table: `scoring_runs`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Internal unique ID |
| started_at | TIMESTAMPTZ | DEFAULT NOW() | When the scoring batch started |
| completed_at | TIMESTAMPTZ | | When the scoring batch finished |
| conversations_scored | INTEGER | DEFAULT 0 | How many conversations were successfully scored |
| conversations_failed | INTEGER | DEFAULT 0 | How many failed to score |
| avg_score | NUMERIC(5,2) | | Average QC score for this batch |
| provider | ENUM | | groq, openrouter, or manual |
| model_name | TEXT | | Specific model used (e.g., "llama-3.3-70b-versatile") |
| error_log | JSONB | DEFAULT '[]' | Array of error records for debugging |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Record creation time |

#### Table: `qc_assessments`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Internal unique ID |
| conversation_id | UUID | FK → conversations(id), CASCADE DELETE | Which conversation this assessment is for |
| total_deductions | NUMERIC(5,2) | DEFAULT 0 | Sum of all error deductions |
| final_score | NUMERIC(5,2) | NOT NULL | max(0, 100 − total_deductions) |
| provider | ENUM | NOT NULL | groq, openrouter, or manual |
| model_name | TEXT | | Specific model that scored this |
| ai_reasoning | TEXT | | Overall AI explanation of the conversation quality |
| prompt_tokens | INTEGER | | Tokens used in the prompt |
| completion_tokens | INTEGER | | Tokens in the AI response |
| latency_ms | INTEGER | | How long the scoring took in milliseconds |
| scoring_run_id | UUID | FK → scoring_runs(id) | Which batch run this was part of |
| scored_at | TIMESTAMPTZ | DEFAULT NOW() | When scoring was completed |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Record creation time |

#### Table: `qc_errors`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Internal unique ID |
| assessment_id | UUID | FK → qc_assessments(id), CASCADE DELETE | Parent assessment |
| category_id | UUID | FK → scoring_categories(id) | Which error category |
| conversation_part_id | UUID | FK → conversation_parts(id) | Which specific reply has the error |
| severity | ENUM | NOT NULL | critical_fail, critical, significant, or major |
| deduction | NUMERIC(5,2) | NOT NULL | Points deducted for this error |
| ai_explanation | TEXT | | AI's reasoning for flagging this error |
| evidence_quote | TEXT | | The specific text from the agent reply that contains the error |
| is_overridden | BOOLEAN | DEFAULT FALSE | Whether a reviewer changed this error |
| override_reason | TEXT | | Why the reviewer overrode this error |
| overridden_by | UUID | | Reviewer's user ID |
| overridden_at | TIMESTAMPTZ | | When the override happened |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Record creation time |

#### Table: `manual_reviews`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Internal unique ID |
| conversation_id | UUID | FK → conversations(id), CASCADE DELETE | Which conversation was reviewed |
| assessment_id | UUID | FK → qc_assessments(id) | The AI assessment being reviewed |
| reviewer_id | UUID | | Auth user ID of the reviewer |
| reviewer_name | TEXT | | Reviewer's display name |
| reviewer_email | TEXT | | Reviewer's email |
| original_qc_score | NUMERIC(5,2) | | AI-generated score before review |
| final_qc_score | NUMERIC(5,2) | | Score after manual adjustments |
| review_notes | TEXT | | Reviewer's free-text comments |
| errors_added | JSONB | DEFAULT '[]' | Errors the reviewer added that AI missed |
| errors_removed | JSONB | DEFAULT '[]' | AI errors the reviewer dismissed |
| claimed_at | TIMESTAMPTZ | | When reviewer started the review |
| completed_at | TIMESTAMPTZ | | When review was submitted |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Record creation time |

#### Table: `sync_state`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Internal unique ID |
| inbox_id | UUID | FK → inboxes(id), UNIQUE | One record per inbox |
| last_synced_at | TIMESTAMPTZ | | When this inbox was last synced |
| last_conversation_updated_at | TIMESTAMPTZ | | Cursor for incremental sync (Intercom updated_at) |
| conversations_synced | INTEGER | DEFAULT 0 | Count of conversations in last sync |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Record creation time |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Last update time (auto-trigger) |

### 10.3 Database View: `agent_qc_summary`

A pre-built PostgreSQL view that aggregates all metrics needed for the Agent Summary Table, joining conversations, agents, inboxes, assessments, and errors to produce per-agent rollup statistics.

### 10.4 Indexes

- `conversations(inbox_id, intercom_created_at DESC)` — Inbox + date filtering
- `conversations(agent_id, review_status)` — Agent leaderboard
- `conversations(cx_score)` — CX Score routing
- `conversations(qc_score)` — QC Score filtering
- `conversations(review_status)` — Review queue
- `conversations(intercom_id)` — Intercom ID lookup
- `conversation_parts(conversation_id, sequence_order)` — Chronological part retrieval
- `conversation_parts(author_type, agent_id)` — Admin reply filtering
- `qc_assessments(conversation_id)` — Score lookup
- `qc_errors(assessment_id)` — Error retrieval
- `qc_errors(category_id)` — Category aggregation

---

## 11. Integration Requirements

### 11.1 Intercom REST API

**Base URL:** `https://api.intercom.io`  
**Authentication:** Bearer token in Authorization header  
**API Version:** 2.11 (set via `Intercom-Version` header)

**Endpoints Used:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/admins` | GET | List all admins (agents) |
| `/teams` | GET | List all teams (inboxes) |
| `/conversations/search` | POST | Search conversations by inbox and date with pagination |
| `/conversations/{id}` | GET | Fetch full conversation with all parts |

**Rate Limits:** ~83 requests per 10 seconds. The system reads `X-RateLimit-Remaining` from response headers and pauses when remaining < 5.

**Pagination:** Cursor-based. The search endpoint returns a `pages.next.starting_after` cursor. The system follows this cursor until it is null or conversations are empty.

**Search Query Structure:**
```json
{
  "query": {
    "operator": "AND",
    "value": [
      {"field": "team_assignee_id", "operator": "=", "value": "INBOX_ID"},
      {"field": "updated_at", "operator": ">", "value": UNIX_TIMESTAMP}
    ]
  },
  "pagination": {"per_page": 50, "starting_after": "CURSOR"}
}
```

**Conversation Parts Structure:**
Each conversation has a `conversation_parts.conversation_parts` array. Each part has:
- `id`: Part ID
- `author.type`: "admin", "bot", or "user"
- `author.id`: Author's Intercom ID
- `body`: HTML content of the message
- `part_type`: "comment", "note", "assignment", etc.
- `created_at`: Unix timestamp

**CX Score Location:**
- Primary: `conversation_rating.rating` (integer 1-5)
- Fallback: `custom_attributes.cx_score`

### 11.2 Groq API

**Base URL:** `https://api.groq.com/openai/v1/chat/completions`  
**Authentication:** Bearer token  
**Model:** `llama-3.3-70b-versatile`  
**Max Tokens:** 4096 (for response)  
**Temperature:** 0.1 (low randomness for consistent scoring)  

**Request format:** OpenAI-compatible chat completions API.

**Free Tier Limits:**
- ~6,000 requests/day
- 30 requests/minute
- 6,000 tokens/minute (for the model)

### 11.3 OpenRouter API

**Base URL:** `https://openrouter.ai/api/v1/chat/completions`  
**Authentication:** Bearer token  
**Format:** OpenAI-compatible  

**Model Rotation (in order of preference):**
1. `google/gemma-4-31b-it:free` — Quality rank #1, 262K context
2. `nvidia/nemotron-3-super-120b-a12b:free` — 1M context, tool support
3. `openai/gpt-oss-120b:free` — 131K context, structured output support

**Free Tier Limits per Model:**
- 20 requests/minute
- 200 requests/day

The system rotates to the next model when the current one returns a 429 rate limit error.

---

## 12. User Interface Requirements

### 12.1 General UI Principles

- Clean, professional design using shadcn/ui components
- Responsive layout (desktop-first, functional on mobile)
- Color scheme consistent with NextVentures branding
- Data tables should be sortable and filterable
- Loading states for all async operations
- Error states with clear messages for failures
- No public-facing pages — all routes require authentication

### 12.2 Navigation Structure

```
Sidebar:
├── Dashboard (Agent Summary Table) — default landing page
├── Review Queue (Manual review for CX 1-2)
├── Agents (list of all agents, clickable to profiles)
└── Settings (future: configure inboxes, categories)

Header:
├── Active filter indicators
├── Search (conversation ID or customer email)
└── User avatar + logout
```

### 12.3 Page Specifications

See FR-3.2 through FR-3.7 in Section 8 for detailed page-by-page requirements.

---

## 13. Workflow Specifications

### 13.1 Workflow: Conversation Ingestion

```
TRIGGER: Cron schedule (every 4 hours)
                │
                ▼
    Fetch admin list from Intercom
    Upsert agents in Supabase
                │
                ▼
    Fetch team list from Intercom
    Upsert inboxes in Supabase
                │
                ▼
    FOR EACH inbox (12 total):
        │
        ├── Get last sync timestamp from sync_state
        │
        ├── Search conversations updated since last sync
        │   (or ALL if first run / full sync)
        │
        ├── FOR EACH conversation:
        │       │
        │       ├── Fetch full conversation with parts
        │       │
        │       ├── Parse: extract CX score, admin replies,
        │       │   customer info, timestamps
        │       │
        │       ├── Upsert conversation in Supabase
        │       │   (preserve review_status if in_review/reviewed)
        │       │
        │       ├── Delete + re-insert conversation parts
        │       │
        │       └── Set review_status = 'pending_scoring'
        │           (only for new conversations)
        │
        └── Update sync_state with latest timestamp

END
```

### 13.2 Workflow: AI Scoring

```
TRIGGER: After ingestion completes (or separate cron)
                │
                ▼
    Query conversations WHERE review_status = 'pending_scoring'
                │
                ▼
    Create new scoring_run record
                │
                ▼
    BATCH (10 at a time):
        │
        ├── FOR EACH conversation in batch:
        │       │
        │       ├── Fetch all conversation_parts
        │       │
        │       ├── Construct scoring prompt:
        │       │   - System: "You are a QC reviewer..."
        │       │   - Include full 26-category rubric
        │       │   - Include conversation thread
        │       │   - Request JSON output
        │       │
        │       ├── TRY: Send to Groq API
        │       │   ON 429/error: Fallback to OpenRouter
        │       │   ON OpenRouter 429: Try next model
        │       │
        │       ├── Parse JSON response
        │       │   ON parse failure: Retry up to 3 times
        │       │   ON all retries failed: Log error, skip
        │       │
        │       ├── Create qc_assessment record
        │       │
        │       ├── Create qc_errors records (one per detected error)
        │       │
        │       ├── Calculate final_score = max(0, 100 - total_deductions)
        │       │
        │       ├── Update conversations.qc_score
        │       │
        │       └── Set review_status:
        │           cx_score 1-2 → 'pending_review'
        │           cx_score 3-5 → 'auto_approved'
        │           cx_score NULL → 'auto_approved'
        │
        └── Pause between batches (rate limit buffer)

    Update scoring_run with final counts
END
```

### 13.3 Workflow: Manual Review

```
TRIGGER: Reviewer opens the Review Queue page
                │
                ▼
    Display conversations WHERE review_status = 'pending_review'
    Sorted by qc_score ASC (lowest/worst first)
                │
                ▼
    Reviewer clicks "Claim for Review" on a conversation
        │
        ├── Set review_status = 'in_review'
        ├── Record reviewer identity + claimed_at timestamp
        └── Open Conversation Detail in review mode
                │
                ▼
    Review Mode — Reviewer evaluates each AI-detected error:
        │
        ├── For each qc_error:
        │       ├── AGREE: No change (error stays)
        │       ├── DISMISS: Mark is_overridden = TRUE
        │       │            Require override_reason text
        │       │            Remove deduction from total
        │       └── (Optional) Change severity level
        │
        ├── ADD NEW ERRORS:
        │       ├── Select category from dropdown
        │       ├── Provide explanation text
        │       └── Add corresponding deduction to total
        │
        ├── Add review_notes (free text)
        │
        └── Recalculate: adjusted_score = max(0, 100 - adjusted_deductions)
                │
                ▼
    Reviewer clicks "Complete Review"
        │
        ├── Create manual_reviews record with all data
        ├── Update conversations.qc_score to adjusted score
        ├── Set review_status = 'reviewed'
        └── Conversation removed from pending queue
END
```

---

## 14. Non-Functional Requirements

### 14.1 Performance

| Metric | Requirement |
|--------|-------------|
| Ingestion throughput | Process 500+ conversations per sync cycle |
| Scoring throughput | Score 500 conversations within 2 hours |
| Dashboard load time | Summary table renders within 3 seconds |
| Conversation detail load | Full thread with scores loads within 2 seconds |
| Export generation | CSV export completes within 10 seconds for up to 10,000 rows |

### 14.2 Availability

| Metric | Requirement |
|--------|-------------|
| Dashboard uptime | 99% during business hours (GMT+6, 9AM-11PM) |
| Data freshness | New conversations appear within 4 hours of Intercom closure |
| Scoring latency | Conversations scored within 1 hour of ingestion |

### 14.3 Security

| Requirement | Implementation |
|-------------|---------------|
| Authentication | Google OAuth via NextAuth, restricted to @nextventures.io |
| Database access | Supabase Row Level Security (RLS) enabled on all tables |
| API keys | Stored as environment variables, never in code |
| Worker access | Uses Supabase service_role key (bypasses RLS) |
| HTTPS | All traffic over HTTPS (enforced by Vercel and Supabase) |
| No customer data export | Customer emails/names visible in dashboard but not in standard exports |

### 14.4 Scalability

The system is designed for current volume (500 conversations/day). If volume exceeds 5,000/day, the following would need to change:

- Move from free-tier AI APIs to paid tiers or self-hosted models
- Move Python workers from Render free tier to a dedicated server
- Consider parallel processing instead of sequential batch scoring
- Add database connection pooling

### 14.5 Data Retention

- Conversations and scores are retained indefinitely in Supabase
- Scoring run logs are retained for 90 days (can be purged after)
- Sync state is overwritten on each run (only latest timestamp kept)

---

## 15. Deployment & Infrastructure

### 15.1 Environments

| Environment | URL | Purpose |
|-------------|-----|---------|
| Development | localhost | Local development and testing |
| Production | [TBD].vercel.app | Live application |

There is no staging environment for this project (not needed for the MVP timeline).

### 15.2 Deployment Strategy

- **Frontend:** Auto-deployed via Vercel on push to `main` branch
- **Database:** Supabase managed service (no deployment needed)
- **Workers:** Deployed to Render free tier as background workers with cron triggers

### 15.3 Environment Variables

| Variable | Component | Description |
|----------|-----------|-------------|
| INTERCOM_API_TOKEN | Workers | Intercom REST API bearer token |
| INTERCOM_API_VERSION | Workers | API version string (default: 2.11) |
| SUPABASE_URL | Workers + Frontend | Supabase project URL |
| SUPABASE_SERVICE_KEY | Workers | Service role key (full access, bypasses RLS) |
| SUPABASE_ANON_KEY | Frontend | Anonymous key (respects RLS) |
| GROQ_API_KEY | Workers | Groq API authentication |
| GROQ_MODEL | Workers | Model to use (default: llama-3.3-70b-versatile) |
| OPENROUTER_API_KEY | Workers | OpenRouter API authentication |
| OPENROUTER_MODELS | Workers | Comma-separated list of fallback models |
| NEXTAUTH_SECRET | Frontend | NextAuth encryption secret |
| GOOGLE_CLIENT_ID | Frontend | Google OAuth client ID |
| GOOGLE_CLIENT_SECRET | Frontend | Google OAuth client secret |

### 15.4 Cron Schedule

| Job | Schedule | Duration Budget |
|-----|----------|----------------|
| Ingestion Worker | Every 4 hours (0 */4 * * *) | ~30 minutes max |
| Scoring Worker | Every 4 hours, offset by 1 hour (0 1,5,9,13,17,21 * * *) | ~90 minutes max |

---

## 16. Assumptions & Dependencies

### 16.1 Assumptions

1. Intercom API access is available with sufficient permissions to read conversations, admins, and teams across all 12 CR inboxes
2. CX Score is stored in `conversation_rating.rating` in Intercom (needs confirmation)
3. Groq and OpenRouter free tiers remain available through August 2026
4. The 26 QC categories in the scorecard are stable and will not change significantly during development
5. ~500 conversations/day is the normal volume; event spikes of 4,000-6,000 are temporary
6. All QC reviewers have @nextventures.io Google accounts
7. The existing QC scorecard (Google Sheet) is the authoritative source for error categories and definitions
8. Conversations are only QC'd after they are closed (not during live chat)

### 16.2 Dependencies

| Dependency | Risk | Mitigation |
|-----------|------|------------|
| Intercom API uptime | Medium | Retry logic with exponential backoff; sync state allows resume |
| Groq free tier availability | Medium | OpenRouter fallback with 3 model rotation |
| OpenRouter free tier availability | Low | Models rotate; new free models added regularly |
| Supabase free tier limits | Low | Current volume well within free tier (500MB DB, 50K rows) |
| Vercel Hobby plan limits | Low | Known constraint: 60s function limit, 1 cron/day (workers run externally) |

---

## 17. Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| AI scoring accuracy below 80% | Medium | High | Iterative prompt tuning using manual QC comparison; start with most impactful categories |
| Free AI API rate limits too restrictive | Medium | Medium | Multi-provider strategy (Groq + 3 OpenRouter models); batch processing; off-peak scheduling |
| CX Score field path differs from assumption | Low | Medium | verify_setup.py checks this; fallback to custom_attributes |
| Intercom API changes or deprecations | Low | High | Pin to API version 2.11; monitor deprecation notices |
| Scoring prompt too large for context window | Low | Medium | Truncate very long conversations; use models with 128K+ context |
| Data volume exceeds free tier capacity | Low | Medium | Monitor Supabase usage; archive old data if needed |
| August 15 deadline not met | Medium | High | Phased delivery: core features first, polish last; buffer week built into schedule |

---

## 18. Acceptance Criteria

### 18.1 Phase Acceptance

**Phase 1 — Setup & Database**
- [ ] Supabase project created with all 10 tables
- [ ] 26 scoring categories seeded and verified
- [ ] Intercom API connection verified via verify_setup.py
- [ ] All 12 CR inbox IDs identified and documented
- [ ] CX Score field path confirmed

**Phase 2 — Data Sync Pipeline**
- [ ] Full sync pulls conversations from all 12 inboxes
- [ ] Agent replies correctly identified (author.type = "admin")
- [ ] CX Scores correctly extracted
- [ ] Incremental sync only fetches new/updated conversations
- [ ] No duplicate conversations after multiple sync runs
- [ ] Sync state tracked per inbox

**Phase 3 — AI Scoring Engine**
- [ ] Conversations scored against all 26 error categories
- [ ] QC Scores correctly calculated (100 minus deductions)
- [ ] CX 1-2 routed to manual review; CX 3-5 auto-approved
- [ ] Groq → OpenRouter fallback works when Groq is rate-limited
- [ ] AI scoring accuracy ≥ 80% agreement with manual QC (±10 points)
- [ ] Scoring runs tracked in scoring_runs table

**Phase 4 — Dashboard**
- [ ] Google login works (restricted to @nextventures.io)
- [ ] Agent Summary Table shows all agents with correct metrics
- [ ] Summary table matches the layout from the provided screenshot
- [ ] Conversation Detail page shows full thread with error overlays
- [ ] Agent Profile page shows individual performance and trends
- [ ] All columns sortable

**Phase 5 — Manual Review**
- [ ] Review queue shows CX 1-2 conversations, sorted by lowest score
- [ ] Reviewer can claim, override, add/remove errors, and complete review
- [ ] Override requires a reason
- [ ] Final adjusted score saved correctly
- [ ] Reviewed conversations removed from queue

**Phase 6 — Launch**
- [ ] All 6 filters work individually and in combination
- [ ] CSV export produces valid files openable in Excel and Google Sheets
- [ ] Automated cron jobs run ingestion + scoring without manual intervention
- [ ] All pages tested with real data
- [ ] Team members can access and use the dashboard

### 18.2 Overall System Acceptance

The system is accepted when:

1. 100% of conversations from 12 CR inboxes are ingested within 4 hours of closure
2. ≥80% of conversations are auto-scored by AI without manual intervention
3. AI scoring accuracy is ≥80% agreement with manual QC reviewers
4. CX Score 1-2 conversations consistently appear in the manual review queue
5. The Agent Summary Table correctly aggregates all metrics
6. Manual review workflow completes without data loss or errors
7. The system runs autonomously on the scheduled cron with no daily manual intervention

---

## 19. Appendices

### Appendix A: QC Scorecard Source

Google Sheets URL: `https://docs.google.com/spreadsheets/d/1XicMWSWmbvSTyotq7H1tNZVUTdtTX7xPDIkFo7vAGZM/edit?gid=1939446107#gid=1939446107`

### Appendix B: Expected Reply Structure (Not Enforced but Recognized)

While agents do not strictly follow templates, their replies generally follow this structure:
1. Greeting
2. Paragraph break
3. Issue acknowledgment / address
4. What happened and what will happen after investigation
5. Closing

The AI scoring prompt should be aware of this structure but should not penalize deviations from it unless they constitute a specific error category.

### Appendix C: Intercom Inbox List

The 12 CR inbox IDs will be documented after running verify_setup.py. This appendix will be updated with the confirmed list.

### Appendix D: Project Repository

GitHub: `github.com/sayedsakib-cloud/ops-dashboard` (or new dedicated repo TBD)

### Appendix E: Related Systems

- **NextVentures Ops Dashboard:** Separate Next.js app with TEEP tab. The QC Platform is standalone and does NOT integrate with the Ops Dashboard.
- **CR Mail Automation:** Google Apps Script system for trading ethics workflows. No integration.
- **Intercom:** Source of truth for all conversation data and CX Scores.

---

*End of Document*
