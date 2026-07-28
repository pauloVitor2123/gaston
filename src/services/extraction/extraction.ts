import type { ILLMClient } from "@/types/llm";
import { ExtractionError } from "@/services/extraction/errors";
import { buildDisambiguationPrompt, buildSystemPrompt } from "@/services/extraction/prompts";
import { sanitizeUserMessage } from "@/services/extraction/sanitize";
import type { Direction, ExtractionContext, ExtractionResult, Intent } from "@/services/extraction/types";
import { validateExtractionResult } from "@/services/extraction/validate";
import { applyMantraRules } from "@/services/extraction/mantra-rules";

const DIRECTION_BY_INTENT: Partial<Record<Intent, Direction>> = {
  record_expense: "out",
  record_income: "in",
};

export class ExtractionService {
  constructor(
    private readonly llm1: ILLMClient,
    private readonly llm2: ILLMClient,
  ) {}

  async extract(message: string, context: ExtractionContext): Promise<ExtractionResult> {
    const sanitized = sanitizeUserMessage(message);

    const raw = await this.llm1.call(`<mensagem>${sanitized}</mensagem>`, buildSystemPrompt(context));

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ExtractionError(`Malformed LLM response: ${raw}`);
    }

    let result = validateExtractionResult(parsed);

    const matchedCard = context.cards.find(
      (c) => c.toLowerCase() === (result.card_name ?? "").toLowerCase(),
    );
    result = { ...result, card_name: matchedCard };

    if (result.category_name && result.category_confidence === "high" && !context.categories.includes(result.category_name)) {
      result = { ...result, category_confidence: "low" };
    }

    if (result.category_confidence === "low") {
      const parts = buildDisambiguationPrompt(sanitized, result, context);
      const category = await this.llm2.call(parts.user, parts.system);
      result = { ...result, category_name: category.trim(), category_confidence: "high" };
    }

    return {
      ...result,
      direction: DIRECTION_BY_INTENT[result.intent] ?? result.direction,
      mantra: applyMantraRules(result.description ?? ""),
    };
  }
}
