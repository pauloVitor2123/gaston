# ADR-004 — Subcategorias: segundo nível de granularidade

Status: **aceito** · Data: 2026-08-29 · Contexto: feature "diferenciar o destino do dinheiro
dentro de uma categoria" (Transporte de app × combustível; Alimentação de mercado × restaurante),
sem que o usuário digite a subcategoria.

## Contexto

A taxonomia era **plana**: `categories { id, userId, name, synonyms[] }`, único em `(userId, name)`,
resolvida no código por casamento de termos (`inferCategory` varrendo todas as categorias) com
fallback **Outros**. Isso responde "pra onde foi o dinheiro" só no nível grosso. O usuário quer um
segundo nível — e, como motorista de app, quer separar o **custo de rodar** (Transporte/Combustível)
do **andar de app** (Transporte/App) — sem nunca ter que informá-lo.

## Decisão

1. **Subcategoria = filha estrita de UMA categoria (2 níveis).** `transactions` ganha
   `subcategory_id` nullable. Sem profundidade 3.
2. **Storage: `categories.parent_id` auto-referente** (sub = categoria com pai), único em
   `(userId, parentId, name)`. Preferido a uma tabela `subcategories` dedicada e a uma coluna de
   texto na transação. Trade-off aceito: reusa a entidade e a coluna `synonyms` existentes, ao custo
   de a tabela `categories` passar a misturar níveis.
3. **Guarda estrita de 2 níveis** compensa o item 2: topo = `parent_id IS NULL`; o pai de uma sub é
   sempre topo; criar sub sob categoria que já é filha é **rejeitado**. Um helper
   (`isTopLevel`/`childrenOf`) centraliza; **toda** listagem/agregação de categoria filtra topo, sub
   só em drill-down.
4. **Termos moram na sub + roll-up na inferência.** Os `synonyms` finos vivem na subcategoria (fonte
   única, sem duplicar no pai). Uma categoria resolve casando `synonyms` **dela ∪ de qualquer
   filho** — `"gasolina 100"` casa via filho Combustível e resolve Transporte / Combustível numa
   passada. Sem o roll-up, mover termos pra baixo faria o topo parar de casar (regressão: código
   passaria a perguntar a categoria).
5. **Atribuição híbrida, o usuário nunca passa.** O código infere a sub por termos; o LLM (que já
   roda em todo gasto — custo marginal zero) propõe `subcategory_name`. A sub do LLM só vale se
   pertencer à **categoria final** resolvida pelo código; senão `null`.
6. **Vocabulário aberto com canonicalização.** O conjunto de subs cresce sozinho: o código normaliza
   o nome proposto e casa contra `name+synonyms` dos filhos → casou **reusa**, senão **cria** sub
   nova (synonyms vazio). O prompt mostra as subs atuais e manda **reusar quando couber** — trava
   anti-fragmentação. **Sem auto-aprendizado** de termo a partir do texto livre (evita ruído).
7. **Nunca pergunta a subcategoria.** Sem match → `subcategory_id = null`. *Gasto avulso* e itens de
   *lote* seguem best-effort com sub `null`, sem atrito. `(sem subcategoria)` é **linha de primeira
   classe** nos relatórios, não erro.
8. **Relatórios sem novos parâmetros na tool.** `query_spending group_by: "category"` passa a
   devolver a **árvore** (categoria + subs + `(sem subcategoria)`); o agente lê a árvore pra
   responder "só gasolina". `/status` mostra subs indentadas; `/dashboard` faz drill-down por clique
   reusando a árvore de `/api/report`.
9. **Sem backfill.** O histórico nasce com `subcategory_id = null`; a granularidade vale daqui pra
   frente.

## Considered Options

- **Tabela `subcategories` dedicada** (recomendação original): força os 2 níveis por construção e
  mantém `categories` plana. Rejeitada em favor de `parent_id` por decisão do dono — menos migração
  de esquema, reuso direto de `synonyms`. O custo (misturar níveis na mesma tabela) é pago pela
  guarda estrita do item 3.
- **Coluna de texto `subcategory` na transação**: sem FK, sem lista por categoria, dedup vira
  comparação de string espalhada. Rejeitada.
- **Vocabulário fechado (só seed/config manual)**: zero fragmentação, mas exige curadoria e
  contradiz "o LLM define pelo conhecimento". Rejeitada.

## Consequências

- **Dedup de topo por índice parcial:** `parent_id` nulável faz o SQLite tratar `NULL` como
  distinto, então `unique(userId, parentId, name)` **não** dedupa nomes de topo. Um índice único
  **parcial** `ON categories (user_id, name) WHERE parent_id IS NULL` restaura essa garantia
  (migration `0005`); as subs (`parent_id NOT NULL`) já são deduplicadas pelo índice principal.
- Toda query/tela que hoje assume "categoria = linha plana" precisa filtrar `parent_id IS NULL`;
  esquecer em um ponto faz sub aparecer como categoria (ou dobrar total). O helper é a mitigação —
  não deixar ninguém varrer `categories` cru.
- Fragmentação residual **possível** se o LLM inventar um sinônimo (`"Abastecimento"`) em vez de
  reusar `Combustível` — mitigada pelo prompt, não eliminada. Um merge manual de subs é aditivo se
  incomodar.
- `inferCategory` deixa de ser uma varredura de um nível e passa a resolver topo por `own ∪ children`
  e então escolher o filho que casou — mais lógica, coberta por testes.

Ver [[Subcategoria]] no `CONTEXT.md`.
