import { z } from "zod";
import type { ToolDefinition } from "@/types/llm";
import { toToolParameters } from "@/services/llm/tool-schema";

export const setBalanceArgsSchema = z.object({
  amount_cents: z.number().int().nonnegative(),
});

export type SetBalanceArgs = z.infer<typeof setBalanceArgsSchema>;

export const SET_BALANCE_TOOL: ToolDefinition = {
  name: "set_balance",
  description:
    "Define/ajusta o saldo atual da conta do usuário (quanto ele tem agora). " +
    "Use para frases de posse/estado atual e ajuste: 'tenho 5000 na conta', 'meu saldo é 4800', " +
    "'tô com 5000 na conta', 'corrige/ajusta o saldo pra X', 'saldo atual X'. " +
    "NÃO use para recebimentos: 'recebi', 'ganhei', 'caiu', 'entrou', 'me pagaram' são receita (record_transaction). " +
    "amount_cents é o saldo total em centavos (inteiro, não-negativo).",
  parameters: toToolParameters(setBalanceArgsSchema),
};
