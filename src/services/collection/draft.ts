import { z } from "zod";
import type { ToolDefinition } from "@/types/llm";
import { toToolParameters } from "@/services/llm/tool-schema";

export const transactionDraftSchema = z.object({
  description: z.string().min(1),
  amount_cents: z.number().int().nonnegative(),
  category_name: z.string().min(1).optional(),
  subcategory_name: z.string().min(1).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type TransactionDraft = z.infer<typeof transactionDraftSchema>;

export const incomeDraftSchema = z.object({
  amount_cents: z.number().int().positive(),
  platform_name: z.string().min(1).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type IncomeDraft = z.infer<typeof incomeDraftSchema>;

export const PLACEHOLDER_DESCRIPTION = "gasto avulso";

export const MANTRAS = ["Doar", "Se Pagar", "Pagas as Contas"] as const;
export type Mantra = (typeof MANTRAS)[number];

export const RECORD_TRANSACTION_TOOL: ToolDefinition = {
  name: "record_transaction",
  description:
    "Registra um gasto do usuário. " +
    "Chame assim que tiver o valor (amount_cents em centavos). " +
    "Se o usuário relatar vários gastos numa mensagem, chame esta ferramenta uma vez por gasto. " +
    `Sem nenhum contexto do que foi (só o valor), use description exatamente "${PLACEHOLDER_DESCRIPTION}" e registre — não pergunte. ` +
    "category_name: escolha a categoria mais provável da lista quando der pra inferir com segurança; " +
    "se não der, deixe em branco (o usuário será perguntado). " +
    "subcategory_name: opcional; reuse uma subcategoria existente da categoria quando servir, senão um nome curto novo; nunca pergunte. " +
    "date: YYYY-MM-DD, só quando o usuário indicar outra data que não hoje ('ontem', 'dia 3'); nunca pergunte a data.",
  parameters: toToolParameters(transactionDraftSchema),
};

export const RECORD_INCOME_TOOL: ToolDefinition = {
  name: "record_income",
  description:
    "Registra uma receita (dinheiro que o usuário RECEBEU: 'recebi 280 da uber', 'diária 99 300', 'faturamento 300'). " +
    "Chame assim que tiver o valor (amount_cents em centavos). Uma chamada por receita; pode vir junto de record_transaction na mesma resposta. " +
    "platform_name: o app de onde veio (Uber, 99, InDrive…) — reuse um nome da lista de plataformas quando servir; " +
    "se o usuário não disser, deixe em branco e registre — nunca pergunte. " +
    "date: YYYY-MM-DD, só quando o usuário indicar outra data que não hoje; nunca pergunte a data.",
  parameters: toToolParameters(incomeDraftSchema),
};
