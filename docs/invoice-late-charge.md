# Spec — Cobrança tardia em fatura paga (BUG-2)

Status: **implementado** · Fecha: **BUG-2** (perda silenciosa de dívida).

## Problema

`invoiceFor()` é determinístico pela data da compra. `CardInvoiceRepository.findOrCreate()`
casa a fatura por `(userId, cardId, cycleStart)` **ignorando o status**, e `listOpen()` só
devolve `status = "open"`. Consequência:

1. Fatura de um ciclo é paga (`status = "paid"`, filhos `settled`).
2. Usuário registra uma compra no cartão com data retroativa daquele ciclo.
3. `invoiceFor` devolve o ciclo pago → `findOrCreate` anexa um filho `pending` à fatura **paga**.
4. `listOpen` não a retorna → a compra some de `/pendentes` e `/status`. A dívida evapora.

## Decisão (grelhada)

**Reabrir a fatura do ciclo verdadeiro** quando uma nova cobrança chega numa fatura já quitada.
Escolhido em vez de "rolar para a próxima fatura aberta" porque é o **mesmo padrão que
`recomputeInvoice` já usa** ao desfazer pagamento (invariante existente no código:
_fatura com filho não pago fica aberta_) — consistente e mínimo.

Invariante: **uma fatura com filho não pago está `open`.**

Efeito: `status paid→open`, `paidAt→null`, **mantém** `paidAmountCents` (o que já foi pago
continua pago). `remaining = total − paidAmountCents` = valor da nova compra > 0 → reaparece em
`/pendentes`. Os filhos antigos permanecem `settled` (foram realmente pagos); só o novo é
`pending`. Ao pagar o restante, `settleInvoiceChildren` quita todos (idempotente nos antigos).

Trade-off aceito: a fatura reaberta exibe o vencimento (passado) original, então aparece como
atrasada. Correto — a cobrança pertence àquele ciclo, que venceu.

## Implementação

`findOrOpenInvoice(repo, userId, cardId, period)` em `src/services/invoice/invoice.ts` — dá um
único lar à reconciliação (evita duplicar nos dois pontos de anexação):

```ts
const invoice = await repo.findOrCreate(userId, cardId, cycle_start, cycle_end, due_date);
if (invoice.status === "open") return invoice;
await repo.update(userId, invoice.id, { status: "open", paidAt: null });
return { ...invoice, status: "open", paidAt: null };
```

Substitui a chamada crua a `findOrCreate` em:
- `transaction.service.ts` (compra avulsa no cartão).
- `installment.service.ts` (cada parcela).

## Testes

- `invoice.test.ts` — `findOrOpenInvoice`: open intocada; paid reabre com o patch correto e
  preserva `paidAmountCents`; closed também reabre.
- `transaction.service.test.ts` — regressão do BUG-2: compra no cartão cujo `findOrCreate`
  devolve fatura `paid` chama `update({status:"open", paidAt:null})` e cria o filho `pending`.

## Não-objetivos

- Não introduz a transição `closed` (segue morta; `findOrOpenInvoice` já a trataria se surgir).
- Não implementa o agregado Invoice completo (candidato D) — este é o primeiro passo dele.
- Não rola cobrança para a próxima fatura (alternativa descartada acima).
