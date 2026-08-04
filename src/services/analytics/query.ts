import { z } from "zod";
import type { ToolDefinition } from "@/types/llm";
import { toToolParameters } from "@/services/llm/tool-schema";

export const querySpendingArgsSchema = z.object({
  group_by: z.enum(["category", "mantra", "card", "payment_method", "none"]),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  direction: z.enum(["in", "out"]).optional(),
});

export type QuerySpendingArgs = z.infer<typeof querySpendingArgsSchema>;
export type SpendingGroupBy = QuerySpendingArgs["group_by"];

export const QUERY_SPENDING_TOOL: ToolDefinition = {
  name: "query_spending",
  description:
    "Consulta quanto foi gasto ou recebido num período, opcionalmente agrupado. " +
    "Use quando o usuário perguntar sobre gastos/recebimentos ('quanto gastei', 'gastos por categoria', 'total do mês'). " +
    "from e to são datas inclusivas YYYY-MM-DD que VOCÊ calcula a partir de hoje e da expressão do usuário " +
    "('esse mês', 'semana passada', 'esse ano', '2 a 10 de maio'). " +
    "group_by: 'category' (por categoria), 'mantra', 'card' (por cartão), 'payment_method', ou 'none' (só o total). " +
    "direction: 'out' para gastos (padrão), 'in' para recebimentos.",
  parameters: toToolParameters(querySpendingArgsSchema),
};
