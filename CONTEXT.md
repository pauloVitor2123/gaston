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

## Coleta (Collection)

- **Gasto avulso** — um gasto informado **só com valor**, sem nenhum contexto do que foi
  ("gastei 50"). O modelo registra na hora com `description = "gasto avulso"`
  (`PLACEHOLDER_DESCRIPTION` em `draft.ts`) em vez de perguntar. A string é a **sentinela
  compartilhada** entre prompt e código: o `MessageHandler` a reconhece (normalizada:
  trim + lowercase) e, em vez de disparar a pergunta de categoria, resolve a categoria
  fallback **Outros** e persiste — zero perguntas. É o contraponto do gasto com contexto
  ("padaria"), que resolve/pergunta categoria normalmente.
- **O que o Gaston nunca pergunta** — só o **valor** justifica uma pergunta em texto.
  **Data** nunca é perguntada (o código assume o [[User's Today (data civil do usuário)]]
  quando ausente); **descrição** nunca é perguntada (vira *gasto avulso*); **categoria** é
  perguntada pelo **código** (não pelo modelo) quando um gasto com contexto real não resolve
  numa categoria existente.
- **Lote de gastos (expense batch)** — uma única mensagem que produz **vários gastos** ("gastei
  100 com gasolina e 50 com estacionamento ontem"). O LLM expressa como **N chamadas paralelas
  de `record_transaction`** (não um array; a tool continua espelhando um-gasto). Regras do lote:
  **gasto tem precedência** — se o turno mistura `record_transaction` com `query_spending`, o
  agente colapsa para o lote de gastos e descarta a consulta (o usuário a refaz com `/status`).
  **Lote nunca pergunta categoria** — item com contexto que não resolve cai em **Outros**
  (mesmo destino do *gasto avulso*), ao contrário do gasto **único**, que ainda pergunta; a
  pergunta seria ambígua entre os itens e brigaria com a pressa do despejo. **Best-effort por
  item** — cada draft é validado e gravado independentemente (não é transação: gastos são
  eventos independentes, sem invariante que os force a cair juntos); confirma exatamente o que
  entrou e avisa o que falhou — nunca perda silenciosa. **Cap de 10** itens (grava os primeiros,
  avisa o excedente). O *gasto avulso* segue aplicado **por-item** (valor solto no meio de
  gastos descritos → Outros, sem pergunta). Um lote que grava tudo **limpa o pending** e não
  cria ciclo; um draft anterior entra só como **contexto** na thread, sem modo especial. A
  confirmação é **uma** mensagem consolidada (uma linha por gasto + total). Ver [[ADR-003]].

## Categorização (Category & Subcategory)

- **Subcategoria** — o segundo (e último) nível da taxonomia de gastos: filha estrita de **uma**
  categoria (`Transporte → {App, Combustível}`, `Alimentação → {Mercado, Restaurante}`). Existe pra
  responder "pra onde o dinheiro foi" com mais granularidade sem o usuário jamais digitá-la.
  Modelada como **categoria com pai** (`categories.parent_id`, auto-referente); `transactions`
  ganha `subcategory_id` nullable. **Invariante dos 2 níveis:** topo é `parent_id IS NULL`; o pai
  de uma subcategoria é sempre topo (não existe nível 3) — criar sub sob uma categoria que já é
  filha é rejeitado. Um helper (`isTopLevel`/`childrenOf`) é a única porta pra essa regra; toda
  listagem/agregação de "categoria" filtra topo, e a sub só aparece em drill-down.
- **Termos moram na sub (fonte única) + roll-up** — os `synonyms` finos vivem na **subcategoria**
  (`Combustível: [gasolina, gnv, ...]`), não duplicados no pai. A inferência de **categoria**
  resolve casando os `synonyms` **dela ∪ de qualquer filho**: `"gasolina 100"` casa via filho
  Combustível e resolve **Transporte / Combustível** numa passada. Sem isso, mover os termos pra
  baixo faria o topo parar de casar e o código perguntaria a categoria (regressão).
- **Vocabulário aberto com canonicalização** — o conjunto de subs de uma categoria **cresce
  sozinho**. O LLM (que já roda em todo gasto) propõe `subcategory_name`; o código **canonicaliza**:
  normaliza e casa contra `name+synonyms` dos filhos daquela categoria → casou **reusa**, senão
  **cria** uma sub nova (synonyms vazio). O prompt mostra as subs atuais e manda **reusar quando
  couber** — é a trava anti-fragmentação (evita `Gasolina`/`Combustível`/`Abastecimento` virarem
  três). **Não há auto-aprendizado** de termo a partir do texto livre (evita ruído); frasear novo é
  coberto pelo LLM a cada vez. A sub proposta pelo LLM só vale se pertencer à **categoria final**
  resolvida pelo código; senão, `null`.
- **"(sem subcategoria)" é linha de primeira classe** — invariante de relatório: um gasto que
  resolveu **categoria** mas **não** sub não é erro nem falta — é o bucket `(sem subcategoria)`,
  que aparece explícito ao lado das subs **quando a categoria tem ao menos uma sub real**. Categoria
  sem nenhuma sub no período permanece uma linha **plana** (não ganha um bucket solitário igual ao
  total) — a indentação só surge onde há de fato granularidade. É onde caem *gasto avulso* (só valor), itens de *lote*
  sem match, e todo o **histórico** anterior à feature (nasce `null`, **sem backfill**). O Gaston
  **nunca pergunta** a subcategoria — ela é sempre best-effort, coerente com [[O que o Gaston nunca
  pergunta]]. Ver [[ADR-004]].
- **Árvore nos relatórios** — `query_spending` **não ganha parâmetros**: `group_by: "category"`
  passa a devolver a **árvore** (categoria + subs + `(sem subcategoria)`), e o agente lê a árvore
  pra responder perguntas finas ("só gasolina") em texto. O `/status` mostra cada categoria com as
  **subs indentadas** (só quando existem) + a linha `(sem sub)`; o `/dashboard` faz **drill-down por
  clique** (fatia da categoria → subs), reusando a mesma árvore de `/api/report`.

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
