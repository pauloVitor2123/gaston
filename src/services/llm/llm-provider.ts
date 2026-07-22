import type { ILLMClient } from "@/types/llm";
import { CreditsExhaustedError, LLMError } from "./errors";

export class LLMProvider implements ILLMClient {
  constructor(private readonly clients: ILLMClient[]) {
    if (clients.length === 0) {
      throw new Error("LLMProvider requer ao menos um client");
    }
  }

  async call(userPrompt: string, systemPrompt?: string): Promise<string> {
    const errors: unknown[] = [];

    for (const client of this.clients) {
      try {
        return await client.call(userPrompt, systemPrompt);
      } catch (error) {
        errors.push(error);
      }
    }

    const detail = errors
      .map((error) => (error instanceof Error ? error.message : String(error)))
      .join(" | ");

    if (errors.every((error) => error instanceof CreditsExhaustedError)) {
      throw new CreditsExhaustedError(`Créditos esgotados em todos os providers: ${detail}`);
    }
    throw new LLMError(`Todos os providers de LLM falharam: ${detail}`);
  }
}
