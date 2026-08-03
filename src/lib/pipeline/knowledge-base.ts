// Auto-generated from docs/references/knowledge_base.md — FundedNext rules
// reference used to judge "Incorrect Information". Keep in sync with the .md.

export const KNOWLEDGE_BASE = `# CR QC Knowledge Base — FundedNext Rules & Process Reference

This is the ground-truth reference the AI scorer uses to judge **Incorrect
Information** (and, secondarily, escalation-context questions). It is condensed
from the CR SOP (CFD Account Verdict Processing) and the FundedNext Trading
Rules & Guidelines help center.

> IMPORTANT FOR SCORING: Processes change regularly. Treat this as the BASE.
> Flag "Incorrect Information" only when an agent's statement **clearly
> contradicts** a rule stated here. When this base is silent, ambiguous, or the
> agent's wording is a reasonable paraphrase, DO NOT flag — absence of a rule
> here is not evidence the agent is wrong.

---

## 1. Trading rules the agent must state correctly

- **Hyperactivity thresholds:** a client is flagged for hyperactivity at **≥ 200
  trades per day** OR **≥ 2,000 server messages per day**. Each executed trade
  generates ~4 server messages (same for setting a stop loss / take profit).
- **Max trades:** a client is allowed a **maximum of 200 trades in a single day**.
- **HFT (High-Frequency Trading):** account is **paused** when **≥ 15,000 server
  messages** are generated. In FN Accounts, HFT leads to termination with
  Partial/Full Payout based on the payout amount.
- **Hyperactivity warnings:** maximum **two warnings** per trader for
  hyperactivity; escalation is Warning → Hard Warning → Termination.
- **Max allocation (DTP):** traders placed in the Disciplined Trader Program are
  assigned a **50K Max Allocation** cap.
- **1% Risk Restriction:** applied to clients flagged for One-Sided Betting on a
  newly issued FundedNext Account.

## 2. Prohibited / restricted strategies (severe — usually termination)

Grid Trading · Tick Scalping · Quick Strike · Group Trading · ACCM (Account
Management Service) · Copy Trading · Self-Copy · Cross-Platform Hedging · EA/VPS
usage without the required Add-On · using a different email as a banned client.

- **Prohibited EA:** immediate **Permanent Termination** + trader suspension;
  refund not initially provided.

## 3. Account actions / verdict types

- **Warning** — lower-severity or first-time violations (e.g., TIPUS first
  occurrence, Margin Warning, Risk Violations).
- **Ask For Explanation (AFE)** — client must explain before a final decision;
  payout goes On Hold, account paused, Brand Promise Ineligibility message sent.
- **Account Termination** — deactivates the specific account.
- **Permanent Termination** — suspends the profile, deactivates all accounts,
  restricts future purchases/access.

## 4. Payout / Performance Reward (client-facing)

- **FPT (Full Payout):** full payout when lifetime PnL or current PnL is **below
  $3,000** (the max payout cap).
- **PAR (Partial Payout):** when PnL is **above $3,000** — generally **50% up to
  $5,000**; beyond that the ratio depends on case severity.
- **DDT / MDDT (Deduction):** violation amount (margin/risk/prohibited strategy)
  is deducted from the payout.
- **PRD (Performance Reward Denial):** not eligible for any payout for the
  specific cycle that was violated (e.g., CTRSF cases).
- **Brand Promise:** the additional **$1,000** under the 24-hour Brand Promise is
  **not applicable** while an account is under review / Performance Reward on hold.

## 5. Refunds (client-facing)

- **Fully declined** for: CID Match, Hireflix, Quick Strike, Group Trading, ACCM,
  EA/VPS without the required add-on, and other severe prohibited strategies.
- **Add-ons > $100** are strictly deducted from the refund amount.
- Discretionary refunds may be offered only for **minor** violations when a client
  escalates heavily — not a default.

## 6. EA/VPS Add-On (accounts purchased from Jan 18, 2026 onward)

- If VPS/EA usage is detected without the required Add-On: account is **paused,
  not terminated**; client must **purchase the applicable Add-On** to bring the
  account into compliance. Processing stays on hold until payment is verified.
- Payment coordination goes through the **PT Team** — agents must **not** share a
  wallet address without confirming it with the PT Team.

## 7. Escalation teams / channels (for escalation-routing judgments)

Valid stakeholders CR escalates to: **Pro Support Team**, **Business Operations
(BOps)**, **Risk Management (RM)**, **BDev**, **Finance**, **PT Team** (payments),
and **Discord**. Escalating to the wrong team, or replying without addressing the
client's actual issue, indicates an escalation-routing problem.

## 8. Communication guidelines

- Urgent cases (High PnL / Terminated / URG payout) must receive initial
  communication **the same day**.
- EU clients must be communicated with only via the **EU Client Communication**
  template; non-EU via the **Abuser Mail** template.
- All client communication uses the **CR Initial Email Automation [Ver 2.10]**
  templates.

## 9. Trading Rules FAQ — topics (anchors; confirm exact numbers in the FAQ)

Restricted trading strategies · Prohibited strategies · Restricted countries ·
Copy Trading rule · Trading Device & Network policy · News Trading · Platform
switching · CFD inactivity period · **1% Risk Limit Rule** · **Maximum lot
size** · Risk Violation types · Account risk limits · **HFT policy** · Scalping ·
Overnight/weekend holding · Tick scalping · **Quick Strike parameter**.

Reference: https://help.fundednext.com/en/collections/11026230-trading-rules-guidelines`;
