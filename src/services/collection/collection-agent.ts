import type { ILLMClient, LLMMessage } from "@/types/llm";
import {
  type IncomeDraft,
  incomeDraftSchema,
  RECORD_INCOME_TOOL,
  RECORD_TRANSACTION_TOOL,
  RECORD_WORK_LOG_TOOL,
  transactionDraftSchema,
  type TransactionDraft,
  type WorkLogDraft,
  workLogDraftSchema,
} from "@/services/collection/draft";
import { buildCollectionSystemPrompt, type AgentContext } from "@/services/collection/prompts";
import {
  QUERY_SPENDING_TOOL,
  querySpendingArgsSchema,
  type QuerySpendingArgs,
} from "@/services/analytics/query";

export type AgentTurn =
  | { kind: "drafts"; drafts: TransactionDraft[]; incomes: IncomeDraft[]; workLogs: WorkLogDraft[] }
  | { kind: "query"; params: QuerySpendingArgs }
  | { kind: "question"; text: string };

const TOOLS = [RECORD_TRANSACTION_TOOL, RECORD_INCOME_TOOL, RECORD_WORK_LOG_TOOL, QUERY_SPENDING_TOOL];
const FALLBACK_QUESTION = "Me conta o valor e o que foi, por favor.";

export class CollectionAgent {
  constructor(private readonly llm: ILLMClient) {}

  async run(messages: LLMMessage[], context: AgentContext): Promise<AgentTurn> {
    const system = buildCollectionSystemPrompt(context);
    const { toolCalls, content } = await this.llm.callWithTools(messages, TOOLS, system);
    const calls = toolCalls ?? [];

    const drafts = calls
      .filter((call) => call.name === RECORD_TRANSACTION_TOOL.name)
      .map((call) => transactionDraftSchema.safeParse(call.arguments))
      .flatMap((parsed) => (parsed.success ? [parsed.data] : []));
    const incomes = calls
      .filter((call) => call.name === RECORD_INCOME_TOOL.name)
      .map((call) => incomeDraftSchema.safeParse(call.arguments))
      .flatMap((parsed) => (parsed.success ? [parsed.data] : []));
    const workLogs = calls
      .filter((call) => call.name === RECORD_WORK_LOG_TOOL.name)
      .map((call) => workLogDraftSchema.safeParse(call.arguments))
      .flatMap((parsed) => (parsed.success ? [parsed.data] : []));
    if (drafts.length > 0 || incomes.length > 0 || workLogs.length > 0) {
      return { kind: "drafts", drafts, incomes, workLogs };
    }

    const query = calls.find((call) => call.name === QUERY_SPENDING_TOOL.name);
    if (query) {
      const parsed = querySpendingArgsSchema.safeParse(query.arguments);
      if (parsed.success) return { kind: "query", params: parsed.data };
    }

    return { kind: "question", text: content?.trim() || FALLBACK_QUESTION };
  }
}
