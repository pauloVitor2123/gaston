import type { IMetricsService } from "@/types/llm";
import { describe, expect, it, vi } from "vitest";
import { CreditsExhaustedError, LLMError } from "./errors";
import { LLMProvider } from "./llm-provider";

const noopMetrics: IMetricsService = { logAttempt: () => {} };

const ok = (text: string) => ({ call: vi.fn(async () => text) });
const fail = (error: Error) => ({
  call: vi.fn(async () => {
    throw error;
  }),
});

describe("LLMProvider", () => {
  it("returns from first client on success, without calling the others", async () => {
    const first = ok("first");
    const second = ok("second");
    const provider = new LLMProvider([first, second], noopMetrics);

    expect(await provider.call("hi")).toBe("first");
    expect(first.call).toHaveBeenCalledOnce();
    expect(second.call).not.toHaveBeenCalled();
  });

  it("falls back to next client when previous one fails", async () => {
    const provider = new LLMProvider([fail(new CreditsExhaustedError("429")), ok("fallback")], noopMetrics);
    expect(await provider.call("hi", "sys")).toBe("fallback");
  });

  it("all fail with credits exhausted → CreditsExhaustedError", async () => {
    const provider = new LLMProvider(
      [fail(new CreditsExhaustedError("a")), fail(new CreditsExhaustedError("b"))],
      noopMetrics,
    );
    await expect(provider.call("hi")).rejects.toBeInstanceOf(CreditsExhaustedError);
  });

  it("non-credits failures → LLMError, not CreditsExhaustedError", async () => {
    const provider = new LLMProvider([fail(new LLMError("500", 500))], noopMetrics);
    const err = await provider.call("hi").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LLMError);
    expect(err).not.toBeInstanceOf(CreditsExhaustedError);
  });

  it("no clients → constructor throws", () => {
    expect(() => new LLMProvider([], noopMetrics)).toThrow();
  });

  it("logs each attempt via MetricsService", async () => {
    const logAttempt = vi.fn();
    const provider = new LLMProvider([fail(new CreditsExhaustedError("err")), ok("ok")], { logAttempt });

    await provider.call("hi");

    expect(logAttempt).toHaveBeenCalledTimes(2);
    expect(logAttempt).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(logAttempt).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
