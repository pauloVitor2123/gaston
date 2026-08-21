# ADR-003 — Lote de gastos: N gastos numa mensagem

Status: **aceito** · Data: 2026-08-20 · Contexto: feature "inserir mais de um gasto de uma vez"
("Gastei 100 com gasolina e 50 com estacionamento ontem").

## Contexto

O pipeline de coleta era de **tiro único** de ponta a ponta: `OpenAICompatibleClient` lia
`tool_calls[0]` (descartava o resto), `ToolCallResult`/`AgentTurn` carregavam uma intenção só, e
`MessageHandler.runAgent` gravava exatamente **um** gasto ou fazia **uma** pergunta. Uma frase com
mais de um gasto forçava o modelo a escolher um e descartar o outro — perda silenciosa.

## Decisão

1. **Expressão: N chamadas paralelas de `record_transaction`** (não um array, não uma tool
   plural). A tool continua espelhando **um** gasto; a camada LLM (`callWithTools`,
   `ToolCallResult`) passa a devolver uma **lista** de tool calls. O caso comum (gasto único)
   não paga imposto estrutural de schema aninhado.
2. **Gasto tem precedência sobre consulta.** Se o turno mistura `record_transaction` com
   `query_spending`, o agente colapsa para o lote de gastos e **descarta** a consulta. Registrar
   é a ação importante/irreversível; a consulta o usuário refaz de graça com `/status`. O
   `AgentTurn` fica `kind: "drafts" | "query" | "question"` — sem explodir a combinatória de um
   `AgentTurn[]` heterogêneo.
3. **Lote nunca pergunta categoria.** Item com contexto real que não resolve numa categoria
   existente cai em **Outros** (mesmo destino do *gasto avulso*), em vez de pausar e perguntar.
   O fluxo de gasto **único** continua perguntando. Justificativa: no lote a pergunta seria
   ambígua entre os itens e mataria o ganho da feature (despejo rápido); "Outros" é destino que
   o *gasto avulso* já aceita.
4. **Best-effort por item, não transacional.** Cada draft é validado (`safeParse`) e gravado
   independentemente. Draft inválido é descartado (se *todos* forem, vira pergunta, como no fluxo
   único). Falha de gravação no meio do lote não faz rollback dos que já entraram. Gastos são
   eventos independentes — não há invariante que os force a cair juntos.
5. **Confirmação consolidada + honesta.** Uma única mensagem (`BotReply` continua um texto): uma
   linha por gasto + total; linha extra avisando o que não entrou. Nunca perda silenciosa.
6. **Cap de 10 itens.** Acima disso grava os 10 primeiros e avisa o excedente — protege contra
   chamada degenerada, nunca atrapalha uso real.
7. **Interação com pending:** um lote que grava **limpa** o `pending` e não acumula ciclo; um
   draft anterior entra só como **contexto** na thread. Sem modo especial "esperando categoria".
8. ***Gasto avulso* por-item:** valor solto entre gastos descritos ("gasolina 100 e 50") → o "50"
   vira placeholder → Outros, sem pergunta. Reusa a lógica de placeholder já existente, por draft.

## Consequências

- `ToolCallResult` deixa de ser "uma tool call ou um texto" e vira "tool calls (0..N) e/ou texto".
  Todo consumidor de `callWithTools` precisa lidar com a lista (hoje só o `CollectionAgent`).
- Leve inconsistência assumida: *"cinema 40"* sozinho pode perguntar categoria; dentro de um lote
  vai pra Outros. Defensável (único = há espaço pra pergunta; lote = pressa).
- Não há visão "revisar/editar" pós-lote — "Outros" é pegajoso até existir edição. Aceito no
  escopo single-user; uma revisão é aditiva no futuro.
- O caso misto registrar+consultar fica só-registra. Se um dia importar, é aditivo (voltar ao
  `AgentTurn[]` heterogêneo).

Ver [[Lote de gastos (expense batch)]] no `CONTEXT.md`.
