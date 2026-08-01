import { z } from "zod";
import type { ToolDefinition } from "@/types/llm";
import { toToolParameters } from "@/services/llm/tool-schema";

export const markPaidArgsSchema = z.object({
  target_type: z.enum(["transaction", "invoice"]),
  target_id: z.number().int().positive(),
  amount_cents: z.number().int().nonnegative().optional(),
});

export type MarkPaidArgs = z.infer<typeof markPaidArgsSchema>;

export const undoPaymentArgsSchema = z.object({
  event_id: z.number().int().positive(),
});

export type UndoPaymentArgs = z.infer<typeof undoPaymentArgsSchema>;

export const MARK_PAID_TOOL: ToolDefinition = {
  name: "mark_paid",
  description:
    "Marca um pendente como pago. Use um target_id da lista 'Pendentes' fornecida. " +
    "Informe amount_cents apenas se o usuário citar um valor pago diferente do previsto.",
  parameters: toToolParameters(markPaidArgsSchema),
};

export const UNDO_PAYMENT_TOOL: ToolDefinition = {
  name: "undo_payment",
  description:
    "Desfaz (estorna) um pagamento já feito. Use um event_id da lista 'Pagamentos recentes' fornecida.",
  parameters: toToolParameters(undoPaymentArgsSchema),
};
