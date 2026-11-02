# Plano — Pivô para motorista de aplicativo

Decisão em [ADR-005](./adr/ADR-005-pivo-motorista.md); vocabulário em `CONTEXT.md` → *Motorista de
aplicativo*. Cinco PRs, cada um utilizável sozinho, na ordem abaixo. Cada PR segue o fluxo do repo:
branch → TDD → `/code-review` local → PR.

Nomes de código propostos (inglês): **Receita** = `transactions.direction = 'in'`, **Plataforma** =
`platforms`, **Jornada** = `work_logs`, **Insight** = `weekly_insights`, lote da mensagem =
`batch_id`.

---

## PR 1 — Mantra invisível + categorias do motorista

Sem mudança de schema.

- **Mantra invisível**: continua inferido (`mantra-rules.ts`) e gravado em `transactions.mantra_id`,
  mas sai de toda superfície:
  - `query_spending` perde `group_by: "mantra"` (`analytics/query.ts`, `analytics.service.ts`,
    `spending.repository.ts`);
  - `/dashboard` perde o gráfico de mantra (`dashboard/page.ts`, `/api/report`);
  - confirmações e `/status` nunca citam mantra (`message.handler.ts`).
- **Subcategorias de Transporte** (`seeds.sql`): Combustível (gasolina, etanol, álcool, gnv, gás,
  diesel, recarga, eletricidade, posto, abastecer), Manutenção, Lavagem, Pedágio, Estacionamento,
  Aluguel do carro, Seguro, Documentação, App (passageiro). Sinônimos conforme a tabela do grilling.
- **Moradia**: "manutenção"/"reparo"/"ferramenta" saem; entram "manutenção da casa", "reparo em
  casa", "botijão".
- Seed idempotente (`INSERT OR IGNORE`) + `UPDATE` dos synonyms existentes em produção.
- Limpar do `CONTEXT.md` as seções de features estacionadas (Fatura, Saldo, Painel do mês /
  `/pendentes`) e atualizar o `CLAUDE.md` para o novo propósito.

**Pronto quando**: "manutenção 400" resolve Transporte/Manutenção; "gás 80" resolve
Transporte/Combustível; nenhuma resposta ou tela contém "mantra".

## PR 2 — Receita + plataforma + desfazer

- **Schema** (migration via `drizzle-kit generate`):
  - `platforms { id, user_id, name, synonyms }`, único em `(user_id, name)`; seed Uber, 99, InDrive.
  - `transactions.platform_id` (nullable) e `transactions.batch_id` (text, nullable, indexado).
- **Coleta**: nova tool `record_income` (zod: `amount_cents`, `platform_name?`, `date?`,
  `description?`). Plataforma canonicalizada como a subcategoria (casa `name+synonyms` → reusa,
  senão cria). Sem plataforma → `null`, nunca pergunta. Receita não tem categoria nem mantra.
- **Lote misto**: `record_transaction` + `record_income` no mesmo turno seguem a regra do ADR-003
  (best-effort por item, uma confirmação consolidada, cap 10).
- **Desfazer**:
  - todo registro de uma mensagem recebe o mesmo `batch_id`;
  - a confirmação leva `[Desfazer]` com `callback_data = "undo:<batch_id>"` — novo prefixo
    roteado em `handleCallback`, separado do round-trip `<pendingId>:<escolha>` existente;
  - desfazer = `status = 'cancelled'` em todos os registros do lote (reversível, sem prazo);
    segundo toque → "já desfeito". A mensagem é editada para "↩️ Desfeito".
  - Todas as agregações ignoram `cancelled` (verificar `spending.repository.ts`).
- **Consulta**: `query_spending` → passa a cobrir receita (total, por plataforma).

**Pronto quando**: "recebi 280 da uber e gastei 90 de gnv" grava os dois, confirma numa mensagem
com um `[Desfazer]`, e desfazer tira os dois dos totais.

## PR 3 — Jornada + métricas + `/status` semanal

- **Schema**: `work_logs { id, user_id, period ('day'|'week'), period_start (date), km?,
  online_minutes?, rides?, status, batch_id, raw_message, created_at }`.
- **Coleta**: tool `record_work_log` (`period?` default `day`, `date?`, `km?`, `online_minutes?`,
  `rides?`). Entra no lote misto e no `[Desfazer]`.
- **Domínio da semana** (`dates.ts`): `weekStart(today)` = segunda no fuso do usuário via `Clock`.
- **Métricas** (serviço puro, muito testado):
  - somatório de jornada com **precedência semanal** (semana com jornada semanal ignora as
    diárias; sem rateio);
  - **pareamento**: por-hora/por-km do dia só com jornada diária; da semana usa os dias pareados ou
    a semana inteira se houver jornada semanal;
  - bruto R$/h, R$/km; lucro R$/h, R$/km (só semana); por corrida: tempo, valor, km médios;
    melhor dia.
- **`/status`** = resumo da semana atual (formato do grilling) + link do painel.
- **Consulta livre**: a tool de consulta ganha as métricas da semana/mês.

**Pronto quando**: com jornadas e receitas de uma semana de teste, `/status` mostra R$/h, R$/km,
min/corrida e melhor dia corretos, inclusive no caso de jornada semanal + diárias na mesma semana.

## PR 4 — Painel semanal + design system

- **Design system** (CSS em `page.ts`):
  - tokens `--bg #FFF/#000`, `--surface #F3F3F3/#141414`, `--text #000/#FFF`,
    `--text-muted #545454/#A6A6A6`, `--positive #05A357/#06C167`, `--negative #E11900/#FF5A47`,
    `--accent #276EF1/#5B91F5`;
  - plataformas: Uber preto/branco (inverte com tema), 99 `#FFC800`, outras em cinzas;
  - Inter (Google Fonts) 400/500/700; escala 32/20/15/13; `tabular-nums`; raio 12px; sem sombra;
  - **escuro padrão**, claro disponível. Sem logo/nome da Uber.
- **Layout**: navegação de semana `‹ ›` (abre na atual, browser-local) → cartões
  Receita/Gastos/Lucro → barras seg→dom empilhadas por plataforma com o melhor dia destacado →
  produtividade → pizza de categorias com drill-down → slot de insights (vazio até o PR 5).
- **Aba Mês**: cartões + produtividade + categorias agregados no mês.
- **API**: `/api/report` ganha `week=YYYY-MM-DD` (segunda) e devolve o pacote semanal; sai o
  filtro de intervalo livre.

**Pronto quando**: o painel navega entre semanas, funciona em 375px de largura, nos dois temas.

## PR 5 — Insights da IA

- **Schema**: `weekly_insights { user_id, week_start, fingerprint, content (json), created_at }`,
  único em `(user_id, week_start)`.
- **Geração preguiçosa**: ao abrir a semana no painel, calcula o `fingerprint` dos agregados; se
  não há insight salvo ou o fingerprint mudou, chama o LLM (via `LLMProvider`) e salva.
- **Entrada**: só agregados da semana + das 4 anteriores (sem mensagens cruas).
- **Saída** (zod): exatamente 3 itens `{ hypothesis, suggestion }`.
- **Dados mínimos**: sem receita **e** jornada na semana → não gera; painel mostra "registre
  km/horas para receber insights".
- **Aviso fixo**: "Sugestões geradas por IA a partir dos seus números. Não é orientação de
  especialista."
- Falha do LLM não quebra o painel: o bloco some com uma mensagem discreta.

**Pronto quando**: abrir o painel duas vezes sem dado novo faz uma única chamada ao LLM; registrar
uma receita nova regenera na próxima abertura.
