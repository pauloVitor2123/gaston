# Pivô: coleta de lançamentos guiada por IA generativa

> Decisão tomada em 2026-07-28 via sessão de grilling. **Reverte** a decisão do CLAUDE.md *"Validation in code (not LLM)"* para a etapa de coleta.

## Motivação

O fluxo atual de coleta é um state-machine determinístico (`firstMissingField`, `fillMissing`, `parseAmountToCents`, `QUESTIONS`) que faz slot-filling com regex e perguntas fixas. O objetivo é um bot mais inteligente: usar IA generativa para entender o que falta e conduzir a conversa até completar o lançamento — mantendo a integridade dos dados financeiros.

## Princípio: LLM propõe, código dispõe

O LLM faz a parte "mole" (interpretar texto livre, decidir qual campo falta, formular a pergunta). O **código** continua dono da validação e da gravação. Nunca terceirizar ao LLM a decisão final de gravar no banco.

## Decisões

| Tema | Decisão |
|---|---|
| **Fonte da verdade** | `zod` como schema único → deriva o type (`z.infer`), o JSON schema para o LLM, e a validação runtime. Substitui `ExtractionResult` / `validate.ts`. |
| **Mecanismo** | Tool/function-calling nativo (schema zod vira definição de tool). Não prompt+parse. |
| **Modelo** | `gpt-4o-mini` no caminho todo (queima créditos OpenAI pausados); fallback `claude-haiku`. Aposenta o `llama:free`. Funde LLM1/LLM2 no fluxo de lançamento. |
| **Campos obrigatórios** | `amount_cents`, `description` → pergunta até **3 ciclos**. |
| **Campos opcionais** | método (→`cash`), cartão, categoria, data (→hoje), parcelas → default. Só pergunta em ambiguidade real (ex.: citou "cartão" mas nenhum/errado), no máx. 1×. |
| **Estouro de ciclos** | Não aborta: mantém `pending_conversations` vivo (TTL ~24h), pausa, retoma na próxima mensagem. |
| **Escopo** | Só lançamentos agora. Consultas (boletos, faturas, saldo) depois. |

## O que sai e o que fica

**Sai** (`message.handler.ts`): `firstMissingField`, `fillMissing`, `parseAmountToCents`, `brNumberToCents`, `QUESTIONS`.

**Fica**: `TransactionService`, repositórios, `invoiceFor`, `sanitize`, wire-up do webhook, resolução de usuário, persistência de pending, `/start` + `/cancelar`, `formatConfirmation`.

## Riscos a testar

- Distinguir "resposta que faltava" de "novo lançamento" na retomada de um rascunho.
- Custo por turno sobe (modelo capaz a cada troca) — mitigado pelo teto de ciclos e por só insistir em campo obrigatório.

## Passos de implementação

1. Adicionar `zod` + `zod-to-json-schema`; modelar o schema de lançamento (obrigatórios vs opcionais com default).
2. Trocar config de modelos para `gpt-4o-mini` + fallback `claude-haiku`; aposentar o `:free` no `wrangler.jsonc`.
3. Estender `OpenAICompatibleClient` para suportar `tools` / `tool_calls`.
4. Reescrever a camada de coleta do `MessageHandler` (remover andaime manual), mantendo validação + persist determinísticos via zod.
5. Ajustar o teto de ciclos → modo rascunho (TTL 24h) na `pending_conversations`.
6. Atualizar o `CLAUDE.md` (stack LLM, decisão de validação, modelo de custo).
