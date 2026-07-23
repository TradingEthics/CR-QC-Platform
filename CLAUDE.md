# CR QC Platform — Claude Code Instructions

## Project Overview

You are building the CR QC Platform — an AI-powered Quality Control system for FundedNext's Case Resolution team. Read `docs/BRD_CR_QC_Platform.md` completely before writing any code. That document is the single source of truth for all requirements, schema, workflows, and scoring logic.

Work autonomously through each phase. Do not stop to ask for confirmation on implementation decisions covered by the BRD. Only pause if you encounter a genuine blocking ambiguity.

## Tech Stack

- **Frontend:** Next.js 16 (App Router) + TypeScript + Turbopack
- **UI:** shadcn/ui components + Tailwind CSS
- **Charts:** Recharts
- **Auth:** NextAuth v5 with Google OAuth (restrict to @nextventures.io domain)
- **Database:** Supabase PostgreSQL (use service_role key for workers, anon key + RLS for frontend)
- **Workers:** Python 3.11+ with httpx (async), html2text, tenacity
- **AI Scoring:** Google Gemini (gemini-3.6-flash) via google-genai, using Batch Mode + structured output (`response_schema`)
- **AI Fallback (planned):** Kimi (Moonshot) — to be added after evaluating Gemini's scoring accuracy
- **Hosting:** Vercel Hobby Plan (frontend), Render Free Tier (Python workers)
- **Repo:** github.com/TradingEthics/CR-QC-Platform

## Project Structure

```
Case-Resolution-QC-Platform/
├── CLAUDE.md
├── .mcp.json
├── .gitignore
├── .env.local                    # Local env vars (never commit)
├── .env.example                  # Template showing required vars
├── docs/
│   ├── BRD_CR_QC_Platform.md     # Full BRD — READ THIS FIRST
│   └── references/               # Supporting docs
├── workers/                      # Python backend workers
│   ├── requirements.txt
│   ├── config.py                 # Shared config (env vars, constants)
│   ├── supabase_client.py        # Supabase connection helper
│   ├── intercom_client.py        # Intercom API wrapper with rate limiting
│   ├── ingestion_worker.py       # Conversation sync from Intercom
│   ├── scoring_worker.py         # AI scoring engine
│   ├── scoring_prompt.py         # QC rubric prompt builder
│   └── verify_setup.py           # Setup verification script
├── src/                          # Next.js frontend
│   ├── app/
│   │   ├── layout.tsx            # Root layout with sidebar nav
│   │   ├── page.tsx              # Redirect to /dashboard
│   │   ├── api/
│   │   │   └── auth/[...nextauth]/route.ts
│   │   ├── dashboard/
│   │   │   └── page.tsx          # Agent Summary Table (landing page)
│   │   ├── agents/
│   │   │   └── [id]/
│   │   │       └── page.tsx      # Agent Profile page
│   │   ├── conversations/
│   │   │   └── [id]/
│   │   │       └── page.tsx      # Conversation Detail page
│   │   └── review/
│   │       └── page.tsx          # Manual Review Queue
│   ├── components/
│   │   ├── layout/               # Sidebar, Header, FilterBar
│   │   ├── tables/               # AgentSummaryTable, ConversationTable
│   │   ├── charts/               # ScoreTrendChart, ErrorDistribution, CXBreakdown
│   │   ├── review/               # ReviewMode, ErrorCard, AddErrorForm
│   │   └── ui/                   # shadcn/ui components
│   ├── lib/
│   │   ├── supabase.ts           # Supabase client (browser + server)
│   │   ├── auth.ts               # NextAuth config
│   │   ├── types.ts              # TypeScript interfaces matching DB schema
│   │   └── utils.ts              # Helpers (score color coding, formatters)
│   └── hooks/
│       ├── useFilters.ts         # Global filter state
│       └── useAgentSummary.ts    # Data fetching hooks
├── sql/
│   ├── 01_schema.sql             # All 10 tables + enums + triggers
│   ├── 02_indexes.sql            # All indexes from BRD section 10.4
│   ├── 03_seed_categories.sql    # 26 QC error categories
│   ├── 04_views.sql              # agent_qc_summary view
│   └── 05_rls_policies.sql       # Row Level Security policies
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
└── vercel.json
```

## Build Phases — Execute in Order

### Phase 1: Project Setup + Database (Days 1-3)

1. Initialize Next.js 16 project with TypeScript and Turbopack
2. Install all dependencies: shadcn/ui, recharts, next-auth, @supabase/supabase-js
3. Create `.env.example` with all 13 env vars from BRD Section 15.3
4. Write all SQL files in `sql/` directory:
   - `01_schema.sql`: 10 tables exactly matching BRD Section 10.2 (use ENUMs for review_status, author_type, severity, provider)
   - `02_indexes.sql`: All indexes from BRD Section 10.4
   - `03_seed_categories.sql`: All 26 categories from BRD Section 9.3 (3 critical_fail, 14 critical, 2 significant, 7 major)
   - `04_views.sql`: agent_qc_summary view per BRD Section 10.3
   - `05_rls_policies.sql`: RLS enabling authenticated read for all tables
5. Set up Supabase client helpers (both TypeScript and Python)
6. Write `verify_setup.py` that tests Intercom API connection, lists inboxes, checks CX Score field path
7. Commit: "Phase 1: Project setup, database schema, seed data"

### Phase 2: Data Sync Pipeline (Days 4-8)

1. Build `workers/intercom_client.py` with:
   - Bearer token auth
   - Rate limit handling (read X-RateLimit-Remaining, pause at < 5)
   - Cursor-based pagination
   - Retry with exponential backoff via tenacity
2. Build `workers/ingestion_worker.py` following BRD Workflow 13.1 exactly:
   - Upsert agents and inboxes first
   - Full sync and incremental sync modes
   - Per-inbox sync state tracking
   - Conversation deduplication by intercom_id
   - Preserve review_status if in_review or reviewed
   - HTML → plain text conversion for body_text
3. Test with a single inbox first, then expand to all 12
4. Commit: "Phase 2: Intercom ingestion pipeline"

### Phase 3: AI Scoring Engine (Days 9-14)

1. Build `workers/scoring_prompt.py`:
   - Load all 26 categories from DB
   - Construct system prompt with full rubric
   - Construct user prompt with conversation thread (labeled by author type)
   - Request structured JSON response matching BRD FR-2.2 format
2. Build `workers/scoring_worker.py` following BRD Workflow 13.2:
   - Gemini Batch Mode (submit batch, poll to completion, collect results by key)
   - Structured output via `response_schema` (validated JSON, no hopeful parsing)
   - Score calculation: max(0, 100 - total_deductions)
   - Review status routing: CX 1-2 → pending_review, CX 3-5 → auto_approved
   - Scoring run tracking with full audit trail
3. Commit: "Phase 3: AI scoring engine with Gemini (gemini-3.6-flash)"

### Phase 4: Dashboard (Days 15-22)

1. Set up NextAuth Google OAuth with @nextventures.io domain restriction
2. Build sidebar layout with navigation: Dashboard, Review Queue, Agents, Settings
3. Build Agent Summary Table (BRD FR-3.2):
   - All 17 columns as specified
   - Color coding: green ≥90, yellow 70-89, red <70
   - Sortable columns
   - Clickable rows → Agent Profile
4. Build Conversation Detail page (BRD FR-3.3):
   - Chat-style thread (customer left, agent right, bot muted)
   - Error overlays on agent messages
   - Expandable error detail panels
5. Build Agent Profile page (BRD FR-3.4):
   - Performance summary with Recharts line chart (score trend)
   - CX Score distribution bar chart
   - Error frequency by type bar chart
   - Sortable conversation list
6. Build filter system (BRD FR-3.6):
   - Inbox, Agent, Date Range, CX Score, QC Score Range, Review Status
   - Combinable filters, visual indicators, clear all button
7. Build CSV export (BRD FR-3.7):
   - 4 export types respecting active filters
   - Valid in Excel and Google Sheets
8. Commit after each major component

### Phase 5: Manual Review Queue (Days 23-27)

1. Build Review Queue page (BRD FR-3.5):
   - Queue count header
   - Conversations sorted by lowest QC Score
   - "Claim for Review" button
2. Build Review Mode (BRD FR-3.5 Review Mode):
   - Agree/Dismiss/Override per error
   - Add New Errors dropdown (26 categories)
   - Live score recalculation
   - "Complete Review" with full data save
3. Follow BRD Workflow 13.3 exactly for state transitions
4. Commit: "Phase 5: Manual review queue and review workflow"

### Phase 6: Polish + Launch (Days 28-30)

1. End-to-end testing with real Intercom data
2. Loading states and error states on all pages
3. Responsive layout check (desktop-first, functional on mobile)
4. Verify cron schedule compatibility with Render free tier
5. Deploy frontend to Vercel, workers to Render
6. Final commit: "Phase 6: Production ready"

## Critical Rules

- **Always read the BRD first.** Every decision should trace back to a specific BRD section.
- **Database schema is gospel.** The 10 tables in BRD Section 10.2 must be implemented exactly — column names, types, constraints, all of it.
- **26 categories, not 25, not 27.** The scoring rubric has exactly 26 error categories across 4 severity tiers (3 + 14 + 2 + 7 = 26). Verify your count.
- **Run `npm run build` after every major change.** Catch TypeScript errors early.
- **Commit after each working feature.** Use descriptive messages referencing the phase.
- **Never hardcode API keys.** All secrets go in `.env.local` (frontend) and environment variables (workers).
- **Never skip error handling.** Every API call, every DB query, every AI response needs try/catch with meaningful error messages.
- **If execution diverges from this plan, stop and explain why** before continuing.
- **Deduplication is critical.** Use Intercom conversation ID as unique key. Never create duplicate conversations.
- **Preserve review state.** Never overwrite review_status if it is `in_review` or `reviewed`.

## Known Constraints

- **Vercel Hobby Plan:** 60-second function limit, 1 cron/day. Workers run on Render, not Vercel.
- **Gemini:** paid API (`gemini-3.6-flash`). Use Batch Mode for the scheduled scoring worker (~50% cheaper, async). Retry 429/5xx with backoff.
- **Supabase Free Tier:** 500MB DB, 50K rows. Current volume is well within limits.
- **Intercom Rate Limit:** ~83 requests per 10 seconds. Read `X-RateLimit-Remaining` header.

## Code Style

- TypeScript strict mode, no `any` types
- Use `async/await` throughout, no raw promises
- Python: type hints, docstrings on all functions, httpx for async HTTP
- Components: functional components with hooks, no class components
- Naming: camelCase for TS variables/functions, snake_case for Python and DB columns
- All Supabase queries go through typed helper functions, never raw strings in components

## MCP Tools Available

- **Supabase MCP:** Use for database operations when available
- **Vercel MCP:** Use for deployment status checks
- **GitHub MCP:** Use for commits and PR creation if available
- **Intercom MCP:** Use for testing API connections if available

## Environment Variables Required

```
# Intercom
INTERCOM_API_TOKEN=
INTERCOM_API_VERSION=2.11

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=

# AI Provider (Gemini)
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.6-flash
GEMINI_USE_BATCH=true

# Auth
NEXTAUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXTAUTH_URL=http://localhost:3000
```