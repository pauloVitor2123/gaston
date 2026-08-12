# ADR-002 — `/status` e `/pendentes` são escopados ao mês civil corrente

Status: **aceito** · Data: 2026-08-11 · Contexto: bug de escopo reportado em produção.

## Contexto

O `/status` (título "Situação do mês") somava em "A vencer" e em "Total em aberto" **todos** os
payables abertos, sem teto de fim de mês — boletos de outubro apareciam e inflavam o total de
agosto. Pior: era inconsistente com o rodapé de saldo, cujo `toPay` (`balance.summarize`) já
filtrava por `dueDate < firstOfNextMonth(today)`. O `/pendentes` idem, listava tudo. O usuário
raciocina mês a mês; quer ver só o que pesa **neste mês**.

## Decisão

1. **Conjunto do mês**, compartilhado por `/status` e `/pendentes` (helper único `scopeToMonth`):
   - **Atrasados**: `dueDate < today` — todos, de qualquer mês (dívida ainda aberta, sem teto).
   - **A vencer neste mês**: `today ≤ dueDate < firstOfNextMonth(today)`.
2. **Fronteira reusada do saldo.** `firstOfNextMonth` sai do `balance.service.ts` para
   `dates.ts` e é importada pelos dois. Assim "Total em aberto" do `/status` = `overdue ∪
   upcoming` = "A pagar no mês" do rodapé (`toPay`) — um número, consistente.
3. **Meses futuros não aparecem** em nenhuma das duas visões (exclusão silenciosa). Surgem
   quando o mês deles chega.
4. **All-clear por mês**: quando o conjunto do mês está vazio (mesmo havendo payables futuros),
   ambos respondem "em dia neste mês" / "nada em aberto neste mês", em vez de imprimir seções
   vazias ou total zero.

## Consequências

- Corpo do `/status` e rodapé de saldo passam a falar do mesmo período (antes divergiam).
- Uma definição única de "payables do mês" (`scopeToMonth`) — locality; muda num lugar só.
- Não há mais uma visão "backlog completo" no bot; obrigações futuras são conhecidas pelo
  sistema mas só exibidas no mês. Se um dia precisar, uma visão "tudo" é aditiva.

Ver [[painel-do-mes]] no `CONTEXT.md`.
