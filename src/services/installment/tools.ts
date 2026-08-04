import { z } from "zod";
import type { ToolDefinition } from "@/types/llm";
import { toToolParameters } from "@/services/llm/tool-schema";

export const recordInstallmentArgsSchema = z.object({
  description: z.string().min(1),
  total_amount_cents: z.number().int().positive(),
  installments_count: z.number().int().min(2).max(48),
  card_name: z.string().min(1),
  category_name: z.string().min(1).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type RecordInstallmentArgs = z.infer<typeof recordInstallmentArgsSchema>;

export const RECORD_INSTALLMENT_TOOL: ToolDefinition = {
  name: "record_installment_purchase",
  description:
    "Registra uma compra parcelada no cartão (ex.: 'máquina de lavar 3668 em 5x no nubank'). " +
    "total_amount_cents é o valor total (não o da parcela). installments_count é o número de parcelas (>= 2). " +
    "card_name é obrigatório e deve ser um cartão da lista.",
  parameters: toToolParameters(recordInstallmentArgsSchema),
};
