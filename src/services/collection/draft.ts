import { z } from "zod";
import type { ToolDefinition } from "@/types/llm";
import { toToolParameters } from "@/services/llm/tool-schema";

export const transactionDraftSchema = z.object({
  description: z.string().min(1),
  amount_cents: z.number().int().nonnegative(),
  category_name: z.string().min(1).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type TransactionDraft = z.infer<typeof transactionDraftSchema>;

export const PLACEHOLDER_DESCRIPTION = "gasto avulso";

export const MANTRAS = ["Doar", "Se Pagar", "Pagas as Contas"] as const;
export type Mantra = (typeof MANTRAS)[number];

export const RECORD_TRANSACTION_TOOL: ToolDefinition = {
  name: "record_transaction",
  description:
    "Registra um gasto do usuário. " +
    "Chame assim que tiver o valor (amount_cents em centavos). " +
    `Sem nenhum contexto do que foi (só o valor), use description exatamente "${PLACEHOLDER_DESCRIPTION}" e registre — não pergunte. ` +
    "category_name: escolha a categoria mais provável da lista quando der pra inferir com segurança; " +
    "se não der, deixe em branco (o usuário será perguntado). " +
    "date: YYYY-MM-DD, só quando o usuário indicar outra data que não hoje ('ontem', 'dia 3'); nunca pergunte a data.",
  parameters: toToolParameters(transactionDraftSchema),
};
