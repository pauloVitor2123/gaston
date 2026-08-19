# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Finanças do PV** (Gaston) is a **simple expense registrar** for Telegram: the user writes an expense in natural language and the bot extracts value + description, assigns a category (and a mantra), and records it. Single user, near-zero infrastructure cost.

Core value: instead of forms or spreadsheets, the user writes freely ("gastei 20 na padaria", "uber 10") and the bot records it, then reports where the money went (`/status` and an HTML `/dashboard`).

> **Scope note (2026-08-17 simplification):** the app was deliberately cut back to a pure expense registrar. **No credit card, no invoices, no installments, no recurring bills, no payments/undo, no balance, no income.** Those features are not deleted — they are **parked in `src/_parked/`** (excluded from `tsconfig` and `vitest`), ready to revive. Do not wire parked code back into the live path without an explicit decision. The Drizzle schema is kept whole; the extra tables/columns are simply dormant (no migration was run).

## Architecture & Stack

**Runtime & Infrastructure (zero-cost tier)**

- **Compute**: Cloudflare Workers (cold start <10ms, always warm)
- **Database**: Cloudflare D1 (SQLite edge-native, same latency as Worker)
- **Bot framework**: [grammY](https://grammy.dev/) (Telegram, zero-cost)
- **Scheduled jobs**: Cloudflare Cron Triggers

**LLM Stack** (pivoted — see [`docs/pivot-coleta-llm.md`](./docs/pivot-coleta-llm.md))

- **A small AI agent**, not a state machine: a single `CollectionAgent` drives the conversation via native **tool/function-calling** with exactly **two tools**: `record_transaction` (record an expense) and `query_spending` (report totals over a period) — otherwise it replies with a text question. `zod` is the single source of truth per tool — it derives the TS type (`z.infer`), the JSON schema for the tool (`z.toJSONSchema`), and runtime validation.
- **Principle: LLM proposes, code disposes.** The model does the "soft" part (interpret free text, decide what's missing, ask); code owns validation and persistence. The final decision to write to the DB is never delegated to the LLM.
- **Parked (stand-by, in `src/_parked/`):** `mark_paid`/`undo_payment` (payments ledger), `record_recurring_bill`/`delete_recurring_bill`, `record_installment_purchase`, `set_balance`, and their code-confirmed `sim/não` flow. Not part of the current scope.
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
CollectionAgent → LLM with record_transaction + query_spending tools (zod-derived JSON schema):
  • record_transaction → validated by zod (value + description required)
  • query_spending     → aggregate over a period (by category / mantra / total)
  • text reply         → a clarifying question (required field still missing)
  ↓
On record_transaction, code disposes (deterministic):
  • date defaults to today
  • category resolved from the DB list; unresolved + list non-empty → ask which category
  • mantra inferred by rule (~95% covered)
  ↓
On question: save/refresh draft in pending_conversations (TTL 24h), reply the question.
  Cycle cap (3) never aborts — it pauses and keeps the draft alive for the next message.
  ↓
Persist a settled expense + 1-line confirmation
```

**Mantra inference rules** (applied in code after the tool call):
- "dízimo, doação" → Doar
- "TotalPass, academia, terapia" → Se Pagar
- default → Pagas as Contas

**Scope**: record an expense (`record_transaction`) + query spending (`query_spending`) + `/status` + `/dashboard`. Everything else is parked (see scope note above).

## Commands (Portuguese UI, English code)

```
<free text>            → record an expense, or ask a spending question
/status                → current civil-month spending total + breakdown by category
/dashboard             → personal signed HTML URL: charts by category & mantra, filter by month/day/range
/cancelar              → abandon an in-progress draft
/help                  → help
```

**`/dashboard`** is served by the Worker itself: `GET /dashboard?u=&t=` returns a self-contained HTML page (Chart.js via CDN) that fetches `GET /api/report?u=&t=&from=&to=&group_by=`. The token is an HMAC-SHA256 of the user id signed with the `DASHBOARD_SECRET` secret; the origin is derived from the incoming webhook request. Code in `src/services/dashboard/` (`token.ts`, `page.ts`, `handler.ts`).

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
- **Secrets**: `DASHBOARD_SECRET` (via `wrangler secret put DASHBOARD_SECRET`) signs the `/dashboard` link token. Tests inject it as a miniflare binding in `vitest.config.ts`.
- **Stand-by convention**: unused features live under `src/_parked/` (mirrors `src/` structure), excluded from `tsconfig.json` and `vitest.config.ts` (`test.exclude`). They are not compiled, bundled, or tested. To revive one, move it back and re-wire the composition root.
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
