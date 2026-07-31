import type { ILLMClient, LLMMessage } from "@/types/llm";
import { RECORD_TRANSACTION_TOOL, transactionDraftSchema, type TransactionDraft } from "@/services/collection/draft";
import { buildCollectionSystemPrompt, type CollectionContext } from "@/services/collection/prompts";

export type AgentTurn =
  | { kind: "draft"; draft: TransactionDraft }
  | { kind: "question"; text: string };

const FALLBACK_QUESTION = "Me conta o valor e o que foi, por favor.";

export class CollectionAgent {
  constructor(private readonly llm: ILLMClient) {}

  async run(messages: LLMMessage[], context: CollectionContext): Promise<AgentTurn> {
    const system = buildCollectionSystemPrompt(context);
    const result = await this.llm.callWithTools(messages, [RECORD_TRANSACTION_TOOL], system);

    if (result.toolCall?.name === RECORD_TRANSACTION_TOOL.name) {
      const parsed = transactionDraftSchema.safeParse(result.toolCall.arguments);
      if (parsed.success) {
        return { kind: "draft", draft: parsed.data };
      }
    }

    return { kind: "question", text: result.content?.trim() || FALLBACK_QUESTION };
  }
}
