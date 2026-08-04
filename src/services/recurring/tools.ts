import { z } from "zod";
import type { ToolDefinition } from "@/types/llm";
import { toToolParameters } from "@/services/llm/tool-schema";

export const recordRecurringBillArgsSchema = z.object({
  description: z.string().min(1),
  amount_cents: z.number().int().nonnegative(),
  due_day: z.number().int().min(1).max(31),
  kind: z.enum(["fixed", "subscription"]).optional(),
  payment_method: z.enum(["pix", "cash", "debit"]).optional(),
  category_name: z.string().min(1).optional(),
});

export type RecordRecurringBillArgs = z.infer<typeof recordRecurringBillArgsSchema>;

export const deleteRecurringBillArgsSchema = z.object({
  bill_id: z.number().int().positive(),
});

export type DeleteRecurringBillArgs = z.infer<typeof deleteRecurringBillArgsSchema>;

export const RECORD_RECURRING_BILL_TOOL: ToolDefinition = {
  name: "record_recurring_bill",
  description:
    "Cadastra uma conta recorrente mensal (boleto fixo ou assinatura) que vence todo mês. " +
    "Use quando o usuário descrever algo que se repete ('todo mês', 'mensal', 'assinatura'). " +
    "due_day é o dia do vencimento (1-31). kind='subscription' para assinaturas (streaming, academia), " +
    "senão 'fixed'. Não aceita cartão aqui.",
  parameters: toToolParameters(recordRecurringBillArgsSchema),
};

export const DELETE_RECURRING_BILL_TOOL: ToolDefinition = {
  name: "delete_recurring_bill",
  description:
    "Cancela uma conta recorrente. Use um bill_id da lista 'Contas recorrentes' fornecida. " +
    "Desativa o template e cancela a cobrança em aberto ainda não paga.",
  parameters: toToolParameters(deleteRecurringBillArgsSchema),
};
