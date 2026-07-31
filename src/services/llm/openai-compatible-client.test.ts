import { LLM_ENDPOINTS } from "@/config";
import type { LLMClientConfig, ToolDefinition } from "@/types/llm";
import { describe, expect, it, vi } from "vitest";
import { CreditsExhaustedError, LLMError } from "./errors";
import { OpenAICompatibleClient } from "./openai-compatible-client";

const config: LLMClientConfig = {
  url: LLM_ENDPOINTS.openai,
  apiKey: "test-key",
  model: "test-model",
};

const tool: ToolDefinition = {
  name: "record_transaction",
  description: "records a transaction",
  parameters: { type: "object", properties: {}, required: [] },
};

const respondWith = (status: number, body: string) =>
  vi.fn<typeof fetch>(async () => new Response(body, { status }));

const toolCallBody = JSON.stringify({
  choices: [
    {
      message: {
        tool_calls: [
          {
            function: {
              name: "record_transaction",
              arguments: JSON.stringify({ amount_cents: 3500, description: "almoço" }),
            },
          },
        ],
      },
    },
  ],
});

const textBody = JSON.stringify({
  choices: [{ message: { content: "Qual o valor?" } }],
});

describe("OpenAICompatibleClient.callWithTools", () => {
  it("sends messages, tools and tool_choice; returns the parsed tool call", async () => {
    const fetchFn = respondWith(200, toolCallBody);
    const client = new OpenAICompatibleClient(config, fetchFn);

    const result = await client.callWithTools(
      [{ role: "user", content: "almoço 35" }],
      [tool],
      "seja um bot",
    );

    expect(result.toolCall).toEqual({
      name: "record_transaction",
      arguments: { amount_cents: 3500, description: "almoço" },
    });
    const body = JSON.parse(fetchFn.mock.calls[0]![1]?.body as string) as {
      messages: unknown;
      tools: Array<{ type: string; function: { name: string } }>;
      tool_choice: string;
    };
    expect(body.messages).toEqual([
      { role: "system", content: "seja um bot" },
      { role: "user", content: "almoço 35" },
    ]);
    expect(body.tools[0]).toMatchObject({ type: "function", function: { name: "record_transaction" } });
    expect(body.tool_choice).toBe("auto");
  });

  it("returns text content when the model asks a question instead of calling the tool", async () => {
    const client = new OpenAICompatibleClient(config, respondWith(200, textBody));

    const result = await client.callWithTools([{ role: "user", content: "gastei" }], [tool]);

    expect(result.content).toBe("Qual o valor?");
    expect(result.toolCall).toBeUndefined();
  });

  it("throws LLMError when tool arguments are malformed JSON", async () => {
    const malformed = JSON.stringify({
      choices: [{ message: { tool_calls: [{ function: { name: "record_transaction", arguments: "{oops" } }] } }],
    });
    const client = new OpenAICompatibleClient(config, respondWith(200, malformed));

    await expect(client.callWithTools([{ role: "user", content: "x" }], [tool])).rejects.toBeInstanceOf(
      LLMError,
    );
  });

  it("429 throws CreditsExhaustedError", async () => {
    const client = new OpenAICompatibleClient(config, respondWith(429, "rate limited"));
    await expect(
      client.callWithTools([{ role: "user", content: "x" }], [tool]),
    ).rejects.toBeInstanceOf(CreditsExhaustedError);
  });

  it("402 throws CreditsExhaustedError", async () => {
    const client = new OpenAICompatibleClient(config, respondWith(402, "no credits"));
    await expect(
      client.callWithTools([{ role: "user", content: "x" }], [tool]),
    ).rejects.toBeInstanceOf(CreditsExhaustedError);
  });

  it("500 throws LLMError (not CreditsExhaustedError)", async () => {
    const client = new OpenAICompatibleClient(config, respondWith(500, "boom"));
    const err = await client
      .callWithTools([{ role: "user", content: "x" }], [tool])
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LLMError);
    expect(err).not.toBeInstanceOf(CreditsExhaustedError);
  });

  it("200 response without content or tool call throws LLMError", async () => {
    const client = new OpenAICompatibleClient(
      config,
      respondWith(200, JSON.stringify({ choices: [{ message: {} }] })),
    );
    await expect(
      client.callWithTools([{ role: "user", content: "x" }], [tool]),
    ).rejects.toBeInstanceOf(LLMError);
  });
});
