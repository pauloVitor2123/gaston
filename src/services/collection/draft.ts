import { z } from "zod";
import type { ToolDefinition } from "@/types/llm";
import { toToolParameters } from "@/services/llm/tool-schema";

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
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  already_paid: z.boolean().optional(),
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
    "Deixe de fora os campos opcionais que o usuário não informou. " +
    "Use due_date (YYYY-MM-DD) quando for uma obrigação futura a pagar (ex.: 'pix pra mãe dia 10'). " +
    "already_paid=false quando o usuário ainda não pagou (ex.: 'boleto venceu ontem, não paguei'); " +
    "already_paid=true ou omitido quando já aconteceu/já pagou.",
  parameters: toToolParameters(transactionDraftSchema),
};
