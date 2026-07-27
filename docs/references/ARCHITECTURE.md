# CR QC Platform — Architecture & Technical Specification

**Project:** Case Resolution Quality Control Platform
**Deadline:** August 15, 2026
**Stack:** Python (ingestion + scoring) · Next.js (frontend) · Supabase (database) · Vercel (hosting) · Google Gemini (gemini-3.6-flash) AI scoring

---

## 1. System Overview

The CR QC Platform ingests Intercom conversations from 12 CR inboxes, extracts agent ("admin") replies, auto-scores them against a structured QC rubric using LLM-as-judge, and routes low-scoring conversations (CX Score 1–2) into a manual review queue. Conversations with CX Score 3–5 are auto-approved.

### Data Flow

```
Intercom REST API (12 inboxes)
        │
        ▼
[Python Ingestion Worker] ──cron──▶ Supabase
        │                              │
        ▼                              │
[Python Scoring Worker]                │
   │  Gemini gemini-3.6-flash (Batch)  │
   │                                   │
   ▼                                   ▼
Supabase (scores + flags)  ◀──── Next.js Dashboard
                                   │
                                   ├─ Agent Leaderboard
                                   ├─ Manual Review Queue (CX 1–2)
                                   ├─ Conversation Drilldown
                                   └─ Summary Table + Filters
```

## 2. Scoring Model

### QC Scorecard (Deduction-Based, 100-point scale)

Each conversation starts at **100**. Errors detected by the AI deduct points:

26 categories across 4 tiers (4 + 12 + 2 + 8):

| Severity | Deduction | Error Types |
|----------|-----------|-------------|
| Critical Fail | −50 | Loss of business, Non-compliant closure, Refund/Payout accuracy, Unauthorized disclosure |
| Major Error | −20 | Incorrect info, Wrong branding, Context-altering spelling, Unprofessional, Escalation errors (4 subtypes), Lack of investigation, Outdated macro, Empathy errors (2 subtypes) |
| Significant Error | −15 | Missing information, Exaggerated engagement |
| Minor Error | −7.5 | Info overload, Overcomplication, Inadequate/excessive engagement, ChatGPT overuse, Missing minimal info, Grammar, Spelling, Typos |

**Final QC Score** = max(0, 100 − sum(deductions)), one deduction per distinct category hit. The AI detects errors; the worker computes the score.

### Routing Logic

QC score is the primary gate; CX score is stored when Intercom provides it and **ignored when absent** (a missing CX never lowers a score or forces review):

- **QC score < 75** → `pending_review` (manual audit)
- **QC score ≥ 75** → `auto_approved`
- **CX score present and 1–2** → `pending_review` (angry customer, even if QC passed)
- Any conversation can be manually reviewed regardless of score

### Grading Bands (dashboard)

`≥ 90` Excellent · `80–89` Good · `75–79` Average · `< 75` Fail (audit). 75 is the pass mark.

### AI Scoring Strategy

**Google Gemini — `gemini-3.6-flash`**, via Gemini Batch Mode. (Kimi may be
added later as a fallback after evaluating Gemini's scoring accuracy.)

- Structured output (`response_schema` + `response_mime_type: application/json`)
  constrains the response to the deduction schema, so a malformed verdict fails
  loudly instead of writing a bad row into `qc_assessments`
- Large context window — a support conversation uses a fraction of it
- Batch Mode is ~50% cheaper; batches typically finish well inside the scoring
  window (scoring is not latency-sensitive)

**Capacity:** sized by API rate limits, not a free-tier tokens-per-day ceiling.

**Volume (measured):** ~475 conversations/day across the 13 CR inboxes, of which
~44% contain a human-agent reply → **~208 QC-able/day (~6,200/month)**. The
human-reply filter roughly halves scoring volume vs. raw conversation counts.

**Cost:** modest at this volume — low tens of dollars/month on Flash-class
pricing. Re-measure tokens per call with the final rubric prompt before quoting
a firm figure; the estimate assumes ~3K input + ~500 output tokens per call.

**Why not free-tier LLM providers:** free tiers are capped on *tokens* per day,
not requests. A typical free tier allows 100K–200K TPD, which at ~3K tokens per
call is roughly 35–65 conversations/day — short of normal volume (500/day) and
far short of a 6,000/day spike. No fallback chain closes that gap.

## 3. Database Schema (Supabase/PostgreSQL)

See `schema.sql` for full migration.

### Core Tables

- `inboxes` — 12 CR inbox configs (Intercom inbox IDs, names)
- `agents` — CR agents (Intercom admin IDs, names)
- `conversations` — Intercom conversations with CX score, QC score, review status
- `conversation_parts` — Individual admin replies extracted from each conversation
- `qc_assessments` — AI-generated QC assessment per conversation (overall + per-category)
- `qc_errors` — Individual errors detected, linked to assessment
- `manual_reviews` — Reviewer overrides for CX 1–2 conversations
- `scoring_categories` — The rubric categories (seeded from scorecard)
- `scoring_runs` — Tracks each batch scoring run for auditability

### Key Indexes

- `conversations(inbox_id, created_at)` — inbox + date filtering
- `conversations(agent_id, review_status)` — agent leaderboard
- `conversations(cx_score)` — CX score routing
- `qc_assessments(conversation_id)` — score lookup

## 4. Intercom Integration

### API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `GET /conversations` | List conversations by inbox, with pagination |
| `GET /conversations/{id}` | Full conversation with parts |
| `GET /admins` | List all admins (agents) |
| `GET /teams` | List teams/inboxes |

### Conversation Parts Structure

Intercom returns conversation parts with `author.type`:
- `"admin"` → Agent reply (QC target)
- `"bot"` → FIN AI / automation
- `"user"` → Customer message

We extract only `admin` parts for QC scoring.

### CX Score Location

**TODO:** Confirm with Sakib — is CX Score:
- Intercom's built-in CSAT rating (`conversation_rating.rating`)
- A custom attribute on the conversation
- A tag or note

Current assumption: `conversation_rating.rating` (1–5 scale)

### Rate Limiting

- Intercom API: ~83 requests/10 seconds (standard plan)
- We implement exponential backoff + respect `X-RateLimit-Remaining` header
- Pagination: cursor-based, 50 conversations per page

## 5. Deployment Architecture

### Python Workers (Render Free Tier or Supabase Edge Functions)

- **Ingestion Worker:** Runs on cron (every 4 hours or configurable)
  - Pulls new/updated conversations since last sync
  - Extracts admin parts
  - Writes to Supabase

- **Scoring Worker:** Runs after ingestion or on separate cron
  - Picks up unscored conversations
  - Submits a Gemini (gemini-3.6-flash) batch for QC assessment, polls to completion
  - Writes scores + flags review status

### Next.js Frontend (Vercel Hobby)

- Auth: NextAuth with Google (restricted domain)
- Dashboard views:
  - Summary table (agent × category score matrix)
  - Manual review queue
  - Conversation drilldown
  - Filters: inbox, agent, date range, CX score, QC score, review status

### Supabase (Free Tier)

- PostgreSQL database
- Row Level Security for auth
- Realtime subscriptions for live dashboard updates (optional)

## 6. Sprint Plan

### Week 1 (Jul 8–14): Foundation ← CURRENT
- [x] Architecture document
- [x] Supabase schema design + migration SQL
- [x] Python ingestion script (Intercom → Supabase)
- [ ] Confirm CX score field path from Intercom
- [ ] Get Intercom API token
- [x] Get Gemini API key (Google AI Studio)
- [ ] Test ingestion with real data

### Week 2 (Jul 15–21): AI Scoring Engine
- [ ] Build scoring prompt from QC rubric
- [ ] google-genai integration with structured output (`response_schema`)
- [ ] Gemini Batch Mode submit/poll/collect loop
- [ ] CX score routing logic (1–2 → manual, 3–5 → auto)
- [ ] Scoring worker with batch processing
- [ ] Test scoring accuracy against manual QC samples

### Week 3 (Jul 22–28): Frontend Core
- [ ] Next.js app scaffold + auth
- [ ] Summary table (agent × category matrix)
- [ ] Agent leaderboard with score distributions
- [ ] Conversation drilldown view

### Week 4 (Jul 29–Aug 4): Manual Review Flow
- [ ] Review queue UI (CX 1–2 conversations)
- [ ] Score override with justification
- [ ] Review completion workflow
- [ ] Reviewer assignment + tracking

### Week 5 (Aug 5–11): Filters, Polish, Edge Cases
- [ ] All filter combinations (inbox, agent, date, score, status)
- [ ] Export (CSV/Excel)
- [ ] Error handling + rate limit resilience
- [ ] Scoring accuracy calibration

### Aug 12–15: Buffer
- [ ] End-to-end testing
- [ ] Deploy to production
- [ ] Handoff documentation
