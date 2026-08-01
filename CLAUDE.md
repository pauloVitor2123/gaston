# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Finanças do PV** is a conversational financial assistant for Telegram that interprets natural language messages about expenses and automatically categorizes, assigns to payment methods, and tracks them. The MVP targets a single user (~10 users max) with near-zero infrastructure cost.

Core value: instead of filling forms or opening spreadsheets, users write freely ("comprei uma máquina de lavar, 3668 em 5x no nubank") and the bot handles extraction, categorization, installment scheduling, and confirmation.

## Architecture & Stack

**Runtime & Infrastructure (zero-cost tier)**

- **Compute**: Cloudflare Workers (cold start <10ms, always warm)
- **Database**: Cloudflare D1 (SQLite edge-native, same latency as Worker)
- **Bot framework**: [grammY](https://grammy.dev/) (Telegram, zero-cost)
- **Scheduled jobs**: Cloudflare Cron Triggers

**LLM Stack** (pivoted — see [`docs/pivot-coleta-llm.md`](./docs/pivot-coleta-llm.md))

- **A multi-tool AI agent**, not a state machine: a single `CollectionAgent` drives the conversation via native **tool/function-calling**. The LLM either calls `record_transaction` (record a lançamento), `mark_paid` (settle a pending target), or `undo_payment` (reverse a payment) — or replies with a text question. `zod` is the single source of truth per tool — it derives the TS type (`z.infer`), the JSON schema for the tool (`z.toJSONSchema`), and runtime validation.
- **Mutations are always code-confirmed** (see [`docs/mark-as-paid.md`](./docs/mark-as-paid.md)): for `mark_paid`/`undo_payment` the LLM only picks a `target_id`/`event_id` from a list the code injects into context; the handler then runs a deterministic `sim/não` confirmation turn before touching the DB. Payments are a `payment_events` ledger (soft-void) so any payment — including partial invoice payments — can be undone.
- **Principle: LLM proposes, code disposes.** The model does the "soft" part (interpret free text, decide what's missing, ask); code owns validation and persistence. The final decision to write to the DB is never delegated to the LLM.
- **Model**: `gpt-4o-mini` (OpenAI, burns paused credits) with `anthropic/claude-3.5-haiku` (OpenRouter) as fallback via `OpenAICompatibleClient` + `LLMProvider`. The `:free` llama model is retired; LLM1/LLM2 are fused into one collection flow.
- **Strategy**: consume paused credits (OpenAI, OpenRouter) before spending new money.

**Why these choices**

- Cold start is critical for Telegram (user-perceived latency). Cloudflare Workers never hibernates; competitors (Neon, Supabase, Render) cold-boot in 30s–800ms.
- D1 (SQLite) has 10GB limit per instance and no `pgvector` — acceptable for MVP; migrates to Postgres (Neon/Supabase) at 1000+ users.
- Telegram for text-free input without message cost or template approval (vs. WhatsApp BSP fees + templates).

## Data Model

All tables are multi-tenant by `user_id` (design for 100+ users from day 1).

| Table | Role |
|---|---|
| `users` | Telegram chat_id, timezone |
| `cards` | Payment cards (name, issuer, closing day, due day, limit) |
| `categories` | User's taxonomy in Portuguese (e.g., Alimentação, Transporte) |
| `mantras` | Spending patterns (e.g., "Pagar Contas", "Se Pagar", "Doar") |
| `recurring_bills` | Fixed costs and subscriptions (auto-materialized monthly) |
| `installment_purchases` | Parent of a multi-installment buy; generates N `transactions` |
| `card_invoices` | **Derived entity** (never hand-entered): calculated monthly statement from all card transactions |
| `transactions` | Central: entries/exits with separate competence (`accrual_date`) and cash (`due_date`) |
| `payment_events` | Ledger of payments (soft-void) against a transaction or invoice; source of truth for undo + partial invoice payment |
| `pending_conversations` | State for multi-turn clarification (TTL via Cron or `expires_at` check); discriminated `kind`: `draft` \| `payment_confirm` \| `undo_confirm` |

**Cash flow rules** (prevent double-counting)

- `transaction` with `payment_method = 'card'` does NOT enter monthly cash flow — it composes the invoice.
- The `card_invoice` (derived, with card due date) enters cash flow — that's what's actually paid.
- Categories/mantras analyze at transaction level (competence); invoices see cash level (due date) — two views, one data model.

**Invoice assignment** is a pure function: `invoice_for(purchase_date, card)` calculates which monthly cycle and due date based on card closing/due rules.

## Processing Pipeline

```
User message (+ prior draft thread, if any)
  ↓
CollectionAgent → LLM with record_transaction tool (zod-derived JSON schema):
  • tool call  → validated by zod (value + description required)
  • text reply → a clarifying question (required field still missing)
  ↓
On tool call, code disposes (deterministic):
  • date defaults to today; payment_method defaults to cash
  • card cited matched against DB names — unknown card → cash + warning
  • mantra inferred by rule (~95% covered)
  ↓
On question: save/refresh draft in pending_conversations (TTL 24h), reply the question.
  Cycle cap (3) never aborts — it pauses and keeps the draft alive for the next message.
  ↓
Persist + 1-line confirmation
```

**Mantra inference rules** (applied in code after the tool call):
- "dízimo, doação" → Doar
- "TotalPass, academia, terapia" → Se Pagar
- default → Pagas as Contas

**Scope**: lançamentos (record_expense/income) + mark-as-paid/undo (`mark_paid`/`undo_payment`). Installments, recurring bills, and queries (balance panels) come later.

## Commands (Portuguese UI, English code)

```
<free text>            → LLM pipeline (record entry/exit/installment/billing, mark paid, query)
/status                → month panel: forecast vs. actual by category, by mantra, open invoices
/fatura [card]         → open invoice: partial total, items, closing date, due date, % of limit
/pendentes             → unpaid bills this month, sorted by due date
/cartao add|edit|del|list
/categoria add|edit|del|list
/desfazer              → cancel last transaction
```

## Roadmap (4-week MVP)

1. **Week 1**: schema + seed (cards, categories, mantras from current spreadsheet) + `invoice_for()` with unit tests
2. **Week 2**: Telegram webhook + LLM 1 + code validation + persist simple entries/exits
3. **Week 3**: installments (generate N transactions), recurring bills + monthly materialization, mark-as-paid
4. **Week 4**: `/status`, `/fatura`, `/pendentes`, daily reminders; run in parallel with spreadsheet for 1 month

**Retirement criterion**: `/status` output matches spreadsheet for an entire month close with zero manual fixes.

## Implementation Notes

- **Code language**: English (snake_case, clear intent). UI strings only in Portuguese.
- **Database access**: **Drizzle ORM** (decided). `src/db/schema.ts` is the single source of truth; `drizzle-kit generate` produces migrations; seeds live in `src/db/seeds.sql` (applied via `wrangler d1 execute --file`).
- **Pending conversation state**: **`expires_at` on read** (decided) — no Cron cleanup.
- **LLM stack**: `OpenAICompatibleClient` exposes `callWithTools` (native tool-calling); `LLMProvider` chains primary → fallback. Model IDs in `wrangler.jsonc` `vars` (`COLLECTION_MODEL` = `gpt-4o-mini` on OpenAI, `COLLECTION_FALLBACK_MODEL` = `anthropic/claude-3.5-haiku` on OpenRouter); API keys via `wrangler secret put` (never in git/GitHub). `CreditsExhaustedError` when all fail. Collection schema/agent live in `src/services/collection/` (`draft.ts` zod schema + tool, `collection-agent.ts`, `prompts.ts`).
- **Architecture**: constructor injection; specific repositories (service coordinates multi-repo); tests colocated (`x.ts` + `x.test.ts`).
- **Workflow**: feature branch → PR → merge. CI (unit, no secrets/mocks) on PR; CD (integration + `wrangler deploy`) on merge to main. `/code-review` run locally before PRs (not in CI — public repo, no Anthropic key).
- **Active plan**: `C:\Users\opera\.claude\plans\peaceful-snacking-hejlsberg.md`

## Coding Conventions (code-review enforces these)

- **No explanatory comments**: code must be self-documenting; do not add comments that describe what/why the code does. Clear names over comments. Only actionable markers (e.g. `TODO`) when the info isn't derivable from code.
- **Path aliases**: use `@/...` (configured via tsconfig `paths`) instead of deep relative imports (`../../`). Refactor `../` imports when touching a file.
- **Schema files**: keep the Drizzle schema split into small per-domain files as it grows (e.g. `src/db/schema/users.ts`, `cards.ts`, `transactions.ts`) re-exported from an index — never one giant `schema.ts`.

## Available Skills

Cloudflare skills are installed — **prefer these over pre-trained knowledge** for platform work (they bias to current Cloudflare docs):

- **`wrangler`** — load before running any `wrangler` command (deploy, dev, d1, secret) for correct syntax
- **`cloudflare`** — general platform (Workers, D1, KV, R2)
- **`workers-best-practices`** — authoring/reviewing Worker code (streaming, floating promises, global state, secrets, bindings)
- **`durable-objects`** — only if stateful coordination is needed (not planned for MVP; state lives in D1)
- **`agents-sdk`** — stateful agents/workflows on Workers (future; not MVP)

Workflow skills in use: **`tdd`** (red-green-refactor), **`code-review`** (local, before PRs).

## Path to SaaS (future phases)

1. Validate bot + backend for single user
2. Stabilize schema with multi-tenant awareness (already in place: `user_id` everywhere)
3. Add dashboards + reminders
4. Enable per-user category/card/rule customization
5. Subscription model (individual, family, self-employed, premium with advanced LLM)
6. Scale to 100+ users

Monetizable features: category personalization, due-date reminders, fixed vs. variable views, forecasting dashboards, semantic search over history, automations (Shortcuts, native mobile).

## Scaling Path

| Users | Stack | Notes |
|---|---|---|
| MVP: ≤100 | current | no changes |
| Early traction: ~500 | current | D1 still sufficient |
| Growth: 1K–10K | Workers paid tier, D1 may need Postgres migration for features/size | monitor D1 growth |
| SaaS 10K+: | Postgres (Neon/Supabase) + sharding or RLS | reassess WhatsApp, Turso alternatives |

## Full context docs

This file is the condensed summary. Full source documents (product pitch, market research, detailed technical design, consolidated tech decisions log, monetization roadmap) live in [`docs/`](./docs) — read them when you need reasoning/trade-offs beyond what's summarized here.
