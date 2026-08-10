# Spec — Clock seam (fonte única de tempo)

Status: **proposto** · Fecha: **BUG-3** (off-by-one de meia-noite) · Habilita: testes de data/settle/expiry determinísticos.

## Problema

"Agora/hoje" nasce em três formas espalhadas, e uma delas está errada:

- `todayInTimeZone(tz)` (handler) — data civil correta no fuso do usuário.
- `todayUtcMidnight()` (`dates.ts`, usado em `transaction.service` e `installment.service`) — data em **UTC**, ignora o fuso.
- `new Date()` solto em services/repos — instantes de carimbo.

Em `America/Sao_Paulo` (UTC-3), das 21h à meia-noite o UTC já virou o dia seguinte. Como o
handler usa fuso e os services usam UTC, um boleto que vence "amanhã" pode ser marcado como
`settled` hoje, e a data de competência default pode cair no dia errado. Além disso, nada
disso é testável sem mockar o `Date` global.

## Decisões (grelhadas)

1. **Clock unificado**: um seam com `now(): Date` (instante) e `today(timeZone): Date` (data civil).
2. **`today` é `Date` @ meia-noite UTC** representando a data civil do usuário. String `YYYY-MM-DD` só na fronteira com o LLM.
3. **`today` é resolvido 1× por turno na borda** (handler) e desce como parâmetro `today: Date`.
   Services seguram o `Clock` apenas para `now()`. Isso garante um único "hoje" consistente no
   turno inteiro (evita divergência na virada do dia entre duas chamadas de service).

**Regra de camadas:** `Clock` é injetado no **handler e nos services**. Repositórios continuam
adapters puros — recebem instantes por parâmetro onde carimbam/filtram tempo (não seguram Clock).

## Interface

Novo `src/services/clock.ts` (+ `clock.test.ts`):

```ts
export interface Clock {
  now(): Date;                    // instante real (epoch)
  today(timeZone: string): Date;  // data civil do usuário @ meia-noite UTC
}

export class SystemClock implements Clock {
  now(): Date { return new Date(); }
  today(timeZone: string): Date { return civilDateInTimeZone(this.now(), timeZone); }
}

// teste:
export class FixedClock implements Clock {
  constructor(private readonly instant: Date) {}
  now(): Date { return this.instant; }
  today(timeZone: string): Date { return civilDateInTimeZone(this.instant, timeZone); }
}
```

`civilDateInTimeZone(instant, tz): Date` é **puro** e vai em `dates.ts` (home da matemática de
data): usa `Intl.DateTimeFormat("en-CA", { timeZone, year, month, day })` para obter a data
civil e devolve `parseUtcDate(...)` (meia-noite UTC). É a lógica que hoje vive em
`todayInTimeZone` no handler, promovida a helper puro.

Também em `dates.ts`: `toIsoDate(date: Date): string` (`YYYY-MM-DD` a partir das partes UTC) —
usado só na fronteira com o LLM.

## Inventário de call-sites (exaustivo)

### Some / migra

| Local | Hoje | Vira |
|---|---|---|
| `dates.ts:10` | `todayUtcMidnight()` | **removido** (sem callers) |
| `handlers/message.handler.ts:613` | `todayInTimeZone(tz)` | movido → `civilDateInTimeZone` em `dates.ts`; handler usa `clock.today` |

### Handler (borda — dono do request context)

- Injetar `Clock` no construtor de `MessageHandler` (novo último argumento).
- Em `route()`, após resolver o `user`: `const today = this.clock.today(user.timezone)` **uma vez**, passar `today: Date` para `showStatus`, `handleSaldo`, `runAgent`.
- `showStatus`/`handleSaldo`/`runAgent`/`recordDraft` passam a receber `today: Date` (hoje recebem/derivam string).
- `recordDraft`: `input.date = draft.date ?? toIsoDate(today)`; `settlesOnRecord(input.already_paid, dueDate, today)`.
- Fronteira LLM: `agent.run(messages, { today: toIsoDate(today), ... })` — `AgentContext.today` continua `string`, `prompts.ts` **não muda**.
- Instantes no handler → `clock.now()`:
  - `:198` `const now = new Date()` (handleSaldo → setBalance)
  - `:242` `setBalance(..., new Date())` (resolveConfirmation)
  - `:505` / `:522` `new Date(Date.now() + TTL)` → `new Date(this.clock.now().getTime() + TTL)`
- `pendingRepo.findActiveByUser(user.id)` → `findActiveByUser(user.id, this.clock.now())`.

### transaction.service.ts

- Injetar `Clock` no construtor.
- `settlesOnRecord(alreadyPaid, dueDate, today: Date)` — novo param; remove `todayUtcMidnight()`.
- `toAccrualDate(date, today: Date)` — usa `today` em vez de derivar.
- `persist(input, userId, rawMessage, today: Date)` — nova assinatura.
- `:78` `settledAt = new Date()` → `this.clock.now()`.

### installment.service.ts

- `create(input, userId, today: Date)` — `:44` `purchaseDate = input.date ? parseUtcDate(input.date) : today`.
- **Não** injeta Clock (não carimba instante — filhos nascem `pending`).

### payment.service.ts

- Injetar `Clock` no construtor (só `now()`; não usa `today`).
- `:162`, `:217`, `:256` `new Date()` → `this.clock.now()`.
- `undo()` → `paymentEventRepo.void(event.id, this.clock.now())`.

### balance.service.ts

- `summarize(user, today: Date)` — muda de `string` para `Date`. `firstOfNextMonth(today: Date)` deixa de parsear.
- `setBalance` já recebe `at: Date` do caller — **sem mudança**.
- `since = user.balanceSetAt ?? new Date(0)` — `new Date(0)` é sentinela (época), **não** é `now()`; permanece. (O comportamento de "saldo nunca definido" é o BUG-4, fora de escopo aqui.)
- **Não** injeta Clock (tudo entra por parâmetro).

### recurring-bill.service.ts

- `create(input, userId, today: Date)` **já** recebe `today: Date` — só o handler para de fazer `parseUtcDate(today)` (passa a `Date` direto). Sem Clock.

### Repositórios (adapters puros — recebem instante por parâmetro)

| Interface | Hoje | Vira |
|---|---|---|
| `IPaymentEventRepository.void(id)` | `set voidedAt: new Date()` | `void(id, at: Date)` → `set voidedAt: at` |
| `IPendingConversationRepository.findActiveByUser(userId)` | filtro `gt(expiresAt, new Date())` | `findActiveByUser(userId, now: Date)` → `gt(expiresAt, now)` |

`transaction.repository` / `card-invoice.repository` já recebem `settledAt`/`paidAt` nos patches
vindos do service — sem mudança.

### composition-root.ts

- `const clock = new SystemClock();`
- Injetar `clock` em: `MessageHandler`, `TransactionService`, `PaymentService`.
- `InstallmentService`, `BalanceService`, `RecurringBillService` **não** recebem Clock.

### Fora de escopo (não é `now()`)

- `index.ts:12` healthcheck `new Date().toISOString()` — irrelevante, fica.
- `llm-provider.ts` `Date.now()` — medição de latência, não é tempo de domínio, fica.

## Plano de testes (TDD, red → green → refactor)

**Regressão do BUG-3 (o teste que prova o conserto), no nível do handler:**
`FixedClock` no instante `2026-08-05T23:30:00-03:00` (= `02:30Z` do dia 06), `user.timezone =
America/Sao_Paulo`. Usuário registra um boleto que vence `2026-08-06` (amanhã, local).
- Antes: `todayUtcMidnight()` = 06 → `06 <= 06` → `settled` (errado).
- Depois: `clock.today('America/Sao_Paulo')` = **05** → `06 <= 05` falso → **`pending`** ✅.

**Novos (`clock.test.ts`):**
- `SystemClock.today(tz)`: instante 23:30 SP → data civil `2026-08-05` (não 06).
- `civilDateInTimeZone`: bordas UTC-3 antes/depois da meia-noite; fuso positivo (ex.: `Asia/Tokyo`).
- `FixedClock.now()` devolve o instante injetado; `today(tz)` deriva dele.

**Atualizados (agora determinísticos com `FixedClock`):**
- `transaction.service.test.ts`: `settlesOnRecord` com `today` injetado; `settledAt === clock.now()`; caso de fronteira de meia-noite.
- `installment.service.test.ts`: `purchaseDate` default = `today` param.
- `payment.service.test.ts`: `settledAt`/`paidAt`/`voidedAt` === instante do `FixedClock`.
- `balance.service.test.ts`: `summarize` recebe `Date`.
- `message.handler.test.ts`: injeta `FixedClock`; inclui a regressão do BUG-3.
- Testes de repo: `void(id, at)` grava `at`; `findActiveByUser(userId, now)` filtra por `now`.

## Plano de ação (ordem de implementação)

1. **`dates.ts`**: adicionar `civilDateInTimeZone` (puro) + `toIsoDate`; remover `todayUtcMidnight`. (quebra callers de propósito — próximos passos consertam)
2. **`clock.ts` + `clock.test.ts`**: `Clock`, `SystemClock`, `FixedClock`. (red → green)
3. **Repos**: `void(id, at)` e `findActiveByUser(userId, now)` (+ interfaces em `types/repository.ts` + testes).
4. **Services** (um por vez, com testes): `transaction` (Clock + `today` param) → `payment` (Clock) → `installment` (`today` param) → `balance` (`today: Date`) → `recurring` (handler para de parsear).
5. **Handler**: injetar Clock, resolver `today` 1× em `route()`, threading, `clock.now()` nos instantes, `toIsoDate` na fronteira LLM.
6. **composition-root**: `SystemClock` + injeções.
7. **Rodar suíte completa** + o teste de regressão do BUG-3 verde.
8. **`/code-review` local** antes do PR (convenção do projeto).

## Não-objetivos

- Não resolve BUG-4 (saldo nunca definido), BUG-2 (fatura), nem os demais do relatório — só o eixo tempo.
- Não introduz `timezone` configurável pelo usuário (o campo já existe; segue default `America/Sao_Paulo`).
- Não mexe em `prompts.ts` nem no formato do draft (a fronteira LLM continua string).
