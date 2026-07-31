import type { IMetricsService, ToolCallResult, ToolDefinition } from "@/types/llm";
import { describe, expect, it, vi } from "vitest";
import { CreditsExhaustedError, LLMError } from "./errors";
import { LLMProvider } from "./llm-provider";

const noopMetrics: IMetricsService = { logAttempt: () => {} };

const tools: ToolDefinition[] = [
  { name: "t", description: "d", parameters: { type: "object" } },
];
const messages = [{ role: "user" as const, content: "hi" }];

const ok = (result: ToolCallResult) => ({ callWithTools: vi.fn(async () => result) });
const fail = (error: Error) => ({
  callWithTools: vi.fn(async () => {
    throw error;
  }),
});

describe("LLMProvider.callWithTools", () => {
  it("returns from first client on success, without calling the others", async () => {
    const first = ok({ content: "first" });
    const second = ok({ content: "second" });
    const provider = new LLMProvider([first, second], noopMetrics);

    expect(await provider.callWithTools(messages, tools)).toEqual({ content: "first" });
    expect(first.callWithTools).toHaveBeenCalledOnce();
    expect(second.callWithTools).not.toHaveBeenCalled();
  });

  it("falls back to next client when previous one fails", async () => {
    const provider = new LLMProvider(
      [fail(new CreditsExhaustedError("429")), ok({ content: "fallback" })],
      noopMetrics,
    );
    expect(await provider.callWithTools(messages, tools, "sys")).toEqual({ content: "fallback" });
  });

  it("all fail with credits exhausted → CreditsExhaustedError", async () => {
    const provider = new LLMProvider(
      [fail(new CreditsExhaustedError("a")), fail(new CreditsExhaustedError("b"))],
      noopMetrics,
    );
    await expect(provider.callWithTools(messages, tools)).rejects.toBeInstanceOf(CreditsExhaustedError);
  });

  it("non-credits failures → LLMError, not CreditsExhaustedError", async () => {
    const provider = new LLMProvider([fail(new LLMError("500", 500))], noopMetrics);
    const err = await provider.callWithTools(messages, tools).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LLMError);
    expect(err).not.toBeInstanceOf(CreditsExhaustedError);
  });

  it("no clients → constructor throws", () => {
    expect(() => new LLMProvider([], noopMetrics)).toThrow();
  });

  it("logs each attempt via MetricsService", async () => {
    const logAttempt = vi.fn();
    const provider = new LLMProvider(
      [fail(new CreditsExhaustedError("err")), ok({ content: "ok" })],
      { logAttempt },
    );

    await provider.callWithTools(messages, tools);

    expect(logAttempt).toHaveBeenCalledTimes(2);
    expect(logAttempt).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(logAttempt).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
