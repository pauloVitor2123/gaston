import { z } from "zod";
import type { ToolDefinition } from "@/types/llm";

export const transactionDraftSchema = z.object({
  intent: z.enum(["record_expense", "record_income"]),
  description: z.string().min(1),
  amount_cents: z.number().int().nonnegative(),
  payment_method: z.enum(["card", "pix", "cash", "debit"]).optional(),
  card_name: z.string().min(1).optional(),
  category_name: z.string().min(1).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  installments_count: z.number().int().positive().optional(),
});

export type TransactionDraft = z.infer<typeof transactionDraftSchema>;
export type Intent = TransactionDraft["intent"];
export type PaymentMethod = NonNullable<TransactionDraft["payment_method"]>;
export type Direction = "in" | "out";

export const MANTRAS = ["Doar", "Se Pagar", "Pagas as Contas"] as const;
export type Mantra = (typeof MANTRAS)[number];

export const RECORD_TRANSACTION_TOOL: ToolDefinition = {
  name: "record_transaction",
  description:
    "Registra um lançamento financeiro (gasto ou recebimento) do usuário. " +
    "Chame apenas quando tiver ao menos o valor (amount_cents) e a descrição (description). " +
    "Deixe de fora os campos opcionais que o usuário não informou.",
  parameters: draftJsonSchema(),
};

function draftJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(transactionDraftSchema) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}
