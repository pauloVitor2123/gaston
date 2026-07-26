import type { ILLMClient } from "@/types/llm";
import { ExtractionError } from "./errors";
import { buildDisambiguationPrompt, buildSystemPrompt } from "./prompts";
import type { ExtractionContext, ExtractionResult } from "./types";

export class ExtractionService {
  constructor(
    private readonly llm1: ILLMClient,
    private readonly llm2: ILLMClient,
  ) {}

  async extract(message: string, context: ExtractionContext): Promise<ExtractionResult> {
    const raw = await this.llm1.call(message, buildSystemPrompt(context));

    let result: ExtractionResult;
    try {
      result = JSON.parse(raw) as ExtractionResult;
    } catch {
      throw new ExtractionError(`Malformed LLM response: ${raw}`);
    }

    if (result.category_confidence === "low") {
      const category = await this.llm2.call(
        buildDisambiguationPrompt(message, result, context),
      );
      return { ...result, category_name: category.trim(), category_confidence: "high" };
    }

    return result;
  }
}
