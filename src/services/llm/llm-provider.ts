import type {
  ILLMClient,
  IMetricsService,
  LLMMessage,
  ToolCallResult,
  ToolDefinition,
} from "@/types/llm";
import { CreditsExhaustedError, LLMError } from "./errors";

export class LLMProvider implements ILLMClient {
  constructor(
    private readonly clients: ILLMClient[],
    private readonly metrics: IMetricsService,
  ) {
    if (clients.length === 0) {
      throw new Error("LLMProvider requires at least one client");
    }
  }

  async callWithTools(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    systemPrompt?: string,
  ): Promise<ToolCallResult> {
    const errors: unknown[] = [];

    for (const client of this.clients) {
      const start = Date.now();
      try {
        const result = await client.callWithTools(messages, tools, systemPrompt);
        await this.metrics.logAttempt({ latencyMs: Date.now() - start, success: true });
        return result;
      } catch (error) {
        await this.metrics.logAttempt({
          latencyMs: Date.now() - start,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
        errors.push(error);
      }
    }

    const detail = errors
      .map((error) => (error instanceof Error ? error.message : String(error)))
      .join(" | ");

    if (errors.every((error) => error instanceof CreditsExhaustedError)) {
      throw new CreditsExhaustedError(`Credits exhausted on all providers: ${detail}`);
    }
    throw new LLMError(`All LLM providers failed: ${detail}`);
  }
}
