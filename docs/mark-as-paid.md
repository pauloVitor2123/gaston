# Mark-as-paid + desfazer

> Decisões tomadas em 2026-07-31 via sessão de grilling. Primeira fatia da Semana 3 (parcelamento e recorrentes vêm depois). Depende do agente multi-tool introduzido no pivô de coleta ([`pivot-coleta-llm.md`](./pivot-coleta-llm.md)).

## Motivação

Fechar o loop "registrar → pagar": marcar contas e faturas como pagas, respeitando o modelo competência (`accrual_date`) vs caixa (`due_date`). Transação de cartão não entra no caixa individualmente — quem é paga é a **fatura**; transação pix/cash/debit é o próprio evento de caixa.

## Princípio: LLM propõe, código dispõe

O LLM interpreta a intenção e escolhe o alvo de uma lista dada pelo código. O **código** valida, confirma e muta. A decisão de escrever no banco nunca é do LLM.

## Decisões

| Tema | Decisão |
|---|---|
| **Alvos** | Transação não-cartão → `settled`; fatura de cartão → `paid`. |
| **Entrada** | Linguagem natural via nova tool `mark_paid` — o agente vira multi-tool (reverte "só lançamentos" do pivô). |
| **Segurança** | Sempre confirmar antes de mutar. Código resolve o candidato; LLM só propõe. |
| **Turno de confirmação** | Código determinístico. Estado `payment_confirm` no `pending_conversations` com o alvo já resolvido. Resposta fora de sim/não → descarta a confirmação e reprocessa a mensagem do zero. |
| **Cascata** | Fatura paga integralmente → transações-filhas viram `settled` (`settledAt = paidAt`). |
| **Valores** | Captura o valor real quando citado (`actualAmountCents`). Fatura suporta pagamento **parcial**: `paidAmountCents` acumula; `status` vira `paid` só quando cobre o total. |
| **Resolução do alvo** | Código injeta os pendentes (id + descrição + valor + vencimento) no contexto do agente; a tool retorna `target_id` + tipo. Código valida que existe e está pendente. |
| **Desfazer** | Incluído — reverter **qualquer** pagamento, também via gate de confirmação. |
| **Ledger** | Nova tabela `payment_events` (soft-void em `voidedAt`, não delete) para histórico e undo multi-nível. |

## Candidatos pagáveis

- Transações não-cartão com `status = pending`.
- Faturas de cartão `open` com saldo (`paidAmountCents < total`).
- Compra de cartão avulsa **não** é pagável direto (só via fatura).
- Instâncias de recorrente ficam de fora (recorrente ainda não existe).

> **Deferido:** hoje `listPayables` usa `listOpen` (status `open`). Quando o ciclo de fechamento de fatura existir (fatura vira `closed` no dia de fechamento antes de ser paga), o filtro de pagáveis precisa incluir `closed`-não-paga. Nenhum código seta `closed` ainda, então ampliar agora seria especulativo.

## Fluxos

**Pagar:** `mark_paid(target_id, target_type, amount_cents?)` → código valida candidato → salva `payment_confirm` + pergunta "Confirma pagar X — R$Y, vence Z?" → `sim` → registra `payment_event`, aplica (tx: `actualAmountCents` + `settled`; invoice: acumula `paidAmountCents`, cascata se integral) → confirmação.

**Desfazer:** `undo_payment` → código lista pagamentos recentes (não-void) no contexto → LLM escolhe o evento → `undo_confirm` → `sim` → marca `payment_events.voidedAt`, recalcula `paidAmountCents`/status e reverte a cascata.

## Estado do pending (união discriminada)

`pending_conversations.stateJson` ganha campo `kind`: `draft` | `payment_confirm` | `undo_confirm`. O `DraftState` da coleta recebe `kind: "draft"`.

## Seams de implementação (TDD)

1. `payment_events` schema + migração + repo (`create`, `listRecentByUser`, `void`, `findById`).
2. `PaymentService`: resolver candidatos, aplicar pagamento (parcial + cascata), aplicar undo (void + recálculo + reverter cascata).
3. Tools `mark_paid` / `undo_payment` + generalização do agente para múltiplas tools; prompt.
4. Handler: máquina de confirmação (`payment_confirm`/`undo_confirm`) + estado discriminado.
5. Wire do contexto: injetar pagáveis + pagamentos recentes.
