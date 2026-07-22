import { LLM_ENDPOINTS } from "@/config";
import type { LLMClientConfig } from "@/types/llm";
import { describe, expect, it, vi } from "vitest";
import { CreditsExhaustedError, LLMError } from "./errors";
import { OpenAICompatibleClient } from "./openai-compatible-client";

const config: LLMClientConfig = {
  url: LLM_ENDPOINTS.openrouter,
  apiKey: "test-key",
  model: "test-model",
};

const respondWith = (status: number, body: string) =>
  vi.fn<typeof fetch>(async () => new Response(body, { status }));

const okBody = JSON.stringify({ choices: [{ message: { content: "olá" } }] });

describe("OpenAICompatibleClient", () => {
  it("builds the request in OpenAI format and returns the content", async () => {
    const fetchFn = respondWith(200, okBody);
    const client = new OpenAICompatibleClient(config, fetchFn);

    const result = await client.call("oi", "seja um bot");

    expect(result).toBe("olá");
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-key");
    const body = JSON.parse(init?.body as string) as { model: string; messages: unknown };
    expect(body.model).toBe("test-model");
    expect(body.messages).toEqual([
      { role: "system", content: "seja um bot" },
      { role: "user", content: "oi" },
    ]);
  });

  it("without systemPrompt sends only the user message", async () => {
    const fetchFn = respondWith(200, okBody);
    const client = new OpenAICompatibleClient(config, fetchFn);

    await client.call("oi");

    const body = JSON.parse(fetchFn.mock.calls[0]![1]?.body as string) as { messages: unknown };
    expect(body.messages).toEqual([{ role: "user", content: "oi" }]);
  });

  it("429 throws CreditsExhaustedError", async () => {
    const client = new OpenAICompatibleClient(config, respondWith(429, "rate limited"));
    await expect(client.call("oi")).rejects.toBeInstanceOf(CreditsExhaustedError);
  });

  it("402 throws CreditsExhaustedError", async () => {
    const client = new OpenAICompatibleClient(config, respondWith(402, "no credits"));
    await expect(client.call("oi")).rejects.toBeInstanceOf(CreditsExhaustedError);
  });

  it("500 throws LLMError (not CreditsExhaustedError)", async () => {
    const client = new OpenAICompatibleClient(config, respondWith(500, "boom"));
    const err = await client.call("oi").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LLMError);
    expect(err).not.toBeInstanceOf(CreditsExhaustedError);
  });

  it("200 response without content throws LLMError", async () => {
    const client = new OpenAICompatibleClient(config, respondWith(200, JSON.stringify({ choices: [] })));
    await expect(client.call("oi")).rejects.toBeInstanceOf(LLMError);
  });
});
