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
