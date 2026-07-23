import type { ILLMClient, LLMClientConfig } from "@/types/llm";
import { CreditsExhaustedError, LLMError } from "./errors";

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export class OpenAICompatibleClient implements ILLMClient {
  constructor(
    private readonly config: LLMClientConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async call(userPrompt: string, systemPrompt?: string): Promise<string> {
    const messages: ChatMessage[] = [
      ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
      { role: "user" as const, content: userPrompt },
    ];

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.apiKey}`,
    };
    if (this.config.referer) headers["HTTP-Referer"] = this.config.referer;
    if (this.config.title) headers["X-Title"] = this.config.title;

    const fetchFn = this.fetchFn;
    const res = await fetchFn(`${this.config.url}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: this.config.model, messages }),
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
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new LLMError(
        `Empty response from model ${this.config.model}`,
        res.status,
        this.config.url,
      );
    }
    return content;
  }
}
