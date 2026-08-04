import type {
  ILLMClient,
  LLMClientConfig,
  LLMMessage,
  ToolCallResult,
  ToolDefinition,
} from "@/types/llm";
import { CreditsExhaustedError, LLMError } from "./errors";

interface ResponseToolCall {
  function?: { name?: string; arguments?: string };
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string; tool_calls?: ResponseToolCall[] };
  }>;
}

export class OpenAICompatibleClient implements ILLMClient {
  constructor(
    private readonly config: LLMClientConfig,
    private readonly fetchFn: typeof fetch = fetch.bind(globalThis),
  ) {}

  async callWithTools(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    systemPrompt?: string,
  ): Promise<ToolCallResult> {
    const body = {
      model: this.config.model,
      messages: [
        ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
        ...messages,
      ],
      tools: tools.map((tool) => ({
        type: "function" as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      })),
      tool_choice: "auto" as const,
    };

    const message = await this.post(body);
    const toolCall = message.tool_calls?.[0];
    if (toolCall?.function?.name) {
      return { toolCall: this.parseToolCall(toolCall.function.name, toolCall.function.arguments) };
    }
    if (message.content) {
      return { content: message.content };
    }
    throw new LLMError(
      `Empty response from model ${this.config.model}`,
      undefined,
      this.config.url,
    );
  }

  private async post(
    body: unknown,
  ): Promise<{ content?: string; tool_calls?: ResponseToolCall[] }> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.apiKey}`,
    };
    if (this.config.referer) headers["HTTP-Referer"] = this.config.referer;
    if (this.config.title) headers["X-Title"] = this.config.title;

    const res = await this.fetchFn(`${this.config.url}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text();
      if (res.status === 402 || res.status === 429) {
        throw new CreditsExhaustedError(
          `Credits/limit exhausted (${res.status}) for model ${this.config.model}: ${detail}`,
          res.status,
          this.config.url,
        );
      }
      throw new LLMError(
        `LLM call failed (${res.status}) for model ${this.config.model}: ${detail}`,
        res.status,
        this.config.url,
      );
    }

    const data = (await res.json()) as ChatCompletionResponse;
    const message = data.choices?.[0]?.message;
    if (!message) {
      throw new LLMError(
        `Empty response from model ${this.config.model}`,
        res.status,
        this.config.url,
      );
    }
    return message;
  }

  private parseToolCall(name: string, rawArguments?: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawArguments ?? "{}");
    } catch {
      throw new LLMError(
        `Malformed tool arguments from model ${this.config.model}: ${rawArguments}`,
        undefined,
        this.config.url,
      );
    }
    return { name, arguments: parsed as Record<string, unknown> };
  }
}
