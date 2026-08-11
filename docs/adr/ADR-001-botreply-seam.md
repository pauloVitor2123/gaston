# ADR-001 — A resposta do bot é um valor de domínio (`BotReply`), não uma `string`

Status: **aceito** · Data: 2026-08-11 · Contexto: Candidato A da revisão de experiência (`/improve-codebase-architecture`, eixo UX vs. mercado).

## Contexto

Todo caminho do `MessageHandler` devolvia `Promise<string>` e o adapter (`index.ts`) fazia
`ctx.reply(string)`. A voz do Gaston era um **primitivo**: nenhuma affordance que o mercado de
bots de Telegram trata como padrão — botão tocável, ação rápida, confirmação em um toque —
cabia no contrato. A confirmação reinventava botões como parsing de texto (`affirmationOf`:
`sim/s/isso/pode…` vs `não/n/cancela…`), com o estado espalhado por `pending_conversations`.
É *Primitive Obsession* no *reply seam*: um seam raso vazando complexidade de UX para
comparação de substrings, e travando os candidatos B–E (correção, extrato, onboarding, lembretes).

## Decisão

1. **`BotReply` como valor de domínio**, agnóstico de canal:
   `type ReplyAction = { id: string; label: string }` ·
   `type BotReply = { text: string; actions?: ReplyAction[] }`. Shape mínimo (uma bolha);
   cresce por adição se um dia precisar de múltiplas mensagens/mídia.
2. **O adapter Telegram é o único que renderiza.** `index.ts` traduz `BotReply` → grammY:
   fluxo de texto envia mensagem nova; fluxo de toque **edita a mensagem de origem** (remove os
   botões, mostra o desfecho) + `answerCallbackQuery` sempre. O domínio nunca sabe se virou
   mensagem ou edição. O adapter é **burro** (tradução pura, sem teste unitário).
3. **Entrada dedicada `handleCallback(chatId, actionId, senderName): Promise<BotReply>`** para
   toques. Texto livre continua em `handle`. `affirmationOf` (sim/não digitado) permanece como
   fallback e converge no mesmo ponto de resolução.
4. **`callback_data = "<pendingId>:<escolha>"`** (`escolha` ∈ `yes`/`no`; cabe em 64 bytes).
   O handler carrega o pending ativo (`findActiveByUser`) e faz **id-match**; se não bate ou
   expirou → "botão expirou", **sem agir**. Resolver deleta o pending → segundo toque cai no
   "expirou" (anti double-tap). Sem novo método de repositório; `pending_conversations`
   permanece a **fonte única** das confirmações em voo.
5. **Escopo inicial: as 4 confirmações** (`payment_confirm`, `undo_confirm`, `balance_confirm`,
   `delete_recurring_confirm`) ganham `[✅ Confirmar] [✕ Não]`. Seleção de categoria e ações de
   read-model (editar/apagar, "pagar agora") montam sobre este seam depois (candidatos B–E).

## Consequências

- **Locality**: a lógica de confirmação deixa de morar metade em parsing de texto e metade em
  estado; o adapter concentra "como o bot fala".
- **A interface vira a superfície de teste**: asserta ações estruturadas
  (`reply.actions`), não substrings. Testes migram de `expect(reply)` para `expect(reply.text)`.
- **Leverage**: destrava B–E como incrementos de UI sobre o seam, não re-encanamentos.
- Passa no **teste da deleção**: remover `BotReply` reconcentraria a complexidade de renderização
  espalhada — sinal de módulo profundo.

Ver [[botreply-resposta]] no `CONTEXT.md`.
