# CONTEXT — Linguagem ubíqua do Gaston

Glossário do domínio. Nomes aqui são os nomes que o código deve usar (em inglês no código,
descritos em português). Seed inicial — cresce conforme os módulos ganham nome.

## Fatura (Card Invoice)

- **Invoice reopen (reabertura de fatura)** — invariante do domínio: **uma fatura com filho
  não pago está `open`**. Quando uma cobrança chega num ciclo cuja fatura já foi quitada
  (compra retroativa), a fatura reabre (`paid → open`, `paidAt → null`, preservando
  `paidAmountCents`) para a nova dívida reaparecer em `/pendentes`. Encapsulado em
  `findOrOpenInvoice` (`src/services/invoice/invoice.ts`), usado por todo ponto que anexa um
  filho a uma fatura. É o mesmo padrão que `PaymentService.recomputeInvoice` aplica ao desfazer
  um pagamento. Ver `docs/invoice-late-charge.md`.

## Saldo (Balance)

- **Baseline âncora** — o saldo só faz sentido a partir de um instante explícito em que o
  usuário afirmou "tenho tanto agora" (`balanceSetAt`). `onHand` e a projeção do mês são
  calculados **desde** essa âncora (`base + recebido − gasto desde então`). Sem âncora não há
  baseline: `balanceSetAt === null` é o estado **"saldo nunca definido"** (distinto de saldo
  zerado). Nele `BalanceService.summarize` retorna `null` — não existe `new Date(0)` como
  sentinela de "desde a época" (isso somava o histórico inteiro contra uma base fictícia de R$ 0).
  Os handlers tratam o `null`: `/saldo` pede para definir; o rodapé do `/status` vira uma dica.

## Painel do mês (/status e /pendentes)

- **Conjunto do mês** — tanto o `/status` ("Situação do mês") quanto o `/pendentes` operam sobre
  o mesmo recorte: **atrasados** (`dueDate < today`, de qualquer mês — dívida ainda aberta) ∪
  **a vencer neste mês** (`today ≤ dueDate < firstOfNextMonth(today)`). Obrigações de meses
  futuros **não aparecem** em nenhum dos dois — surgem quando o mês delas chega. A fronteira de
  fim de mês é a **mesma** que o `balance.summarize` usa em `toPay`, então "Total em aberto" do
  `/status` bate com "A pagar no mês" do rodapé de saldo. Um só helper (`scopeToMonth`) define o
  recorte; `firstOfNextMonth` mora em `dates.ts`. Ver [[ADR-002]].

## Painel (Dashboard link)

- **Link assinado do painel** — o `/dashboard` no chat devolve uma URL
  `{origin}/dashboard?u={userId}&t={token}`. O `token` é **stateless** e **expira em 24h**:
  `t = "{exp}.{hmac}"`, onde `exp` é o epoch-ms de validade e `hmac = HMAC-SHA256(secret,
  "{userId}.{exp}")` (hex). `verifyToken` recusa se `exp ≤ now` (expirado) ou se a assinatura
  não bate (adulterado/segredo errado), com comparação em tempo constante. `exp` viaja **dentro**
  do token, então a URL mantém só `u` + `t`. Não há tabela de sessões nem revogação individual —
  o link simplesmente vence; rodar `/dashboard` de novo emite outro (barato, single-user). O
  `now` vem do [[Clock]] (`clock.now()`) tanto ao assinar (`DashboardLink.build`) quanto ao
  verificar (rota em `index.ts` injeta `now` no handler). `DASHBOARD_SECRET` assina; trocá-lo
  invalida todos os links de uma vez. Código em `src/services/dashboard/token.ts`.

- **"Hoje" do painel é browser-local (fronteira deliberada)** — ao contrário do `/status`, que
  ancora "hoje"/"este mês" no fuso do usuário via `clock.today(user.timezone)`, o painel calcula
  os defaults de período no **cliente** (`new Date()` do browser). Escolha consciente: os
  `<input type=date|month>` já são browser-locais, então misturar um "hoje" server-tz com pickers
  locais confundiria mais. Consequência aceita: se o painel for aberto de um device em outro fuso,
  o default "este mês"/"hoje" pode divergir do `/status` por até um dia. Para o único usuário
  (quase sempre no fuso de casa) os dois batem. As datas escolhidas viajam como `YYYY-MM-DD` e o
  servidor as compara contra `dueDate` (meia-noite UTC), inclusivas nas duas pontas (o
  `AnalyticsService` soma +1 dia ao `to`).

## Resposta (BotReply)

- **BotReply** — o valor de domínio que representa o que o Gaston responde: `{ text: string;
  actions?: ReplyAction[] }`, **agnóstico de canal**. Um **ReplyAction** (`{ id, label }`) é um
  botão tocável. O `MessageHandler` produz `BotReply`; **só o adapter Telegram (`index.ts`)
  sabe renderizar** — mensagem nova (fluxo de texto) vs. edição da mensagem de origem (fluxo de
  toque), teclado inline, `answerCallbackQuery`. O domínio nunca sabe se virou mensagem ou edição.
- **Round-trip do toque** — botão inline dispara um `callback_query` com `data =
  "<pendingId>:<escolha>"` (`escolha` ∈ `yes`/`no`). O handler entra por `handleCallback`,
  carrega o pending ativo e faz **id-match**: se o `id` não bate (expirou ou foi substituído),
  responde "botão expirou" **sem agir**. Confirmações em voo continuam ancoradas em
  `pending_conversations` (o botão só referencia; ver [[ADR-001]]). Digitar "sim/não"
  (`affirmationOf`) permanece como fallback e converge no mesmo ponto de resolução.

## Tempo

- **Clock** — o seam (interface) que é a única fonte de tempo do sistema. Expõe `now(): Date`
  (o instante real) e `today(timeZone): Date` (a data civil do usuário). `SystemClock` é a
  implementação de produção; testes injetam um `FixedClock`. Nenhum service chama `new Date()`
  ou deriva "hoje" por conta própria — tudo passa pelo Clock.

- **Instant (`now`)** — um momento no tempo (timestamp epoch), independente de fuso. Carimba
  eventos que aconteceram: `settledAt`, `paidAt`, `voidedAt`, `balanceSetAt`, `expiresAt`.
  Vem de `clock.now()`.

- **User's Today (data civil do usuário)** — o dia no calendário do usuário, no fuso dele
  (`user.timezone`, default `America/Sao_Paulo`). Representado como `Date` fixado em
  meia-noite UTC daquele dia civil. É resolvido **uma vez por turno** na borda (handler) via
  `clock.today(user.timezone)` e desce como parâmetro `today: Date`. Governa regra de negócio
  dependente de calendário: data de competência (accrual) default, `settlesOnRecord`,
  ocorrência de conta recorrente, projeção de fim de mês, data da compra parcelada.

  > Por que meia-noite UTC e não o instante local: todas as comparações de vencimento já
  > operam sobre `Date` em UTC (`dueDate.getTime()`). Fixar a data civil em meia-noite UTC
  > deixa as comparações diretas, sem parse espalhado. A string `YYYY-MM-DD` só existe na
  > fronteira com o LLM (prompt/draft).
