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

**LLM Stack**

- **Multi-provider abstraction** via `callLLM()`: Anthropic (API direct), OpenAI, or OpenRouter selectable via `LLM1_PROVIDER` and `LLM2_PROVIDER` env vars
- **LLM 1** (fast/cheap, Haiku): intent extraction → JSON (intent, value, date, category, card, installments_count, etc.)
- **LLM 2** (called on demand, ~15–20% of messages): disambiguation of category/mantra when LLM 1 result is ambiguous
- **Strategy**: consume paused credits (OpenAI, OpenRouter) before spending new money on Anthropic API

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
| `pending_conversations` | State for multi-turn clarification (TTL via Cron or `expires_at` check) |

**Cash flow rules** (prevent double-counting)

- `transaction` with `payment_method = 'card'` does NOT enter monthly cash flow — it composes the invoice.
- The `card_invoice` (derived, with card due date) enters cash flow — that's what's actually paid.
- Categories/mantras analyze at transaction level (competence); invoices see cash level (due date) — two views, one data model.

**Invoice assignment** is a pure function: `invoice_for(purchase_date, card)` calculates which monthly cycle and due date based on card closing/due rules.

## Processing Pipeline

```
User message
  ↓
LLM 1 (Haiku): extract intent + fields → JSON
  ↓
Validation in code (not LLM):
  • Value + description present? (date defaults to today)
  • Installment: count present?
  • Card cited exists in DB? (match by name/alias)
  • Category matches DB categories or synonym?
  • Mantra inferrable by rule (~95% covered)?
  ↓
If category/mantra ambiguous → LLM 2 (15–20% of messages)
  ↓
If required field missing → ask consolidator question (max 3 cycles)
  ↓
Persist + 1-line confirmation
```

**Mantra inference rules** cover ~95% before LLM 2:
- "dízimo, doação" → Doar
- "TotalPass, academia, terapia" → Se Pagar
- default → Pagas as Contas

**Open question**: after 1–2 weeks of MVP usage, validate if LLM 1 alone (with few-shot + category list in prompt) hits 90%+ accuracy, making LLM 2 optional. Decision point: accuracy vs. cost trade-off.

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
- **LLM stack**: single `OpenAICompatibleClient` (covers OpenRouter + OpenAI). Model IDs in `wrangler.jsonc` `vars`; API keys via `wrangler secret put` (never in git/GitHub). Per-function fallback chains: LLM1 `llama-3.1-8b:free` → `gpt-4o-mini` (OpenAI); LLM2 `claude-sonnet-4` → `gpt-4o-mini`. `CreditsExhaustedError` when all fail.
- **Architecture**: constructor injection; specific repositories (service coordinates multi-repo); tests colocated (`x.ts` + `x.test.ts`).
- **Workflow**: feature branch → PR → merge. CI (unit, no secrets/mocks) on PR; CD (integration + `wrangler deploy`) on merge to main. `/code-review` run locally before PRs (not in CI — public repo, no Anthropic key).
- **Active plan**: `C:\Users\opera\.claude\plans\peaceful-snacking-hejlsberg.md`

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
