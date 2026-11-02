import { z } from "zod";
import type { ToolDefinition } from "@/types/llm";
import { toToolParameters } from "@/services/llm/tool-schema";

export const querySpendingArgsSchema = z.object({
  subject: z.enum(["expenses", "income", "productivity"]).optional(),
  group_by: z.enum(["category", "platform", "none"]),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type QuerySpendingArgs = z.infer<typeof querySpendingArgsSchema>;
export type SpendingGroupBy = QuerySpendingArgs["group_by"];

export const QUERY_SPENDING_TOOL: ToolDefinition = {
  name: "query_spending",
  description:
    "Consulta quanto foi gasto ou recebido num período, opcionalmente agrupado. " +
    "subject: 'expenses' para gastos ('quanto gastei', 'gastos por categoria') ou 'income' para receitas " +
    "('quanto ganhei', 'quanto a 99 me pagou') ou 'productivity' para o resumo da semana com lucro, R$/hora, R$/km, " +
    "tempo médio por corrida e melhor dia ('como foi minha semana', 'meu R$/km') — nesse caso from é qualquer dia da semana desejada; padrão 'expenses'. " +
    "from e to são datas inclusivas YYYY-MM-DD que VOCÊ calcula a partir de hoje e da expressão do usuário " +
    "('esse mês', 'semana passada', 'esse ano', '2 a 10 de maio'). " +
    "group_by: 'category' (gastos por categoria), 'platform' (receitas por plataforma) ou 'none' (só o total).",
  parameters: toToolParameters(querySpendingArgsSchema),
};
