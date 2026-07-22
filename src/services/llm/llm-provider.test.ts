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
  it("retorna do primeiro client quando sucede, sem chamar os outros", async () => {
    const first = ok("primeiro");
    const second = ok("segundo");
    const provider = new LLMProvider([first, second], noopMetrics);

    expect(await provider.call("oi")).toBe("primeiro");
    expect(first.call).toHaveBeenCalledOnce();
    expect(second.call).not.toHaveBeenCalled();
  });

  it("cai pro próximo client quando o anterior falha", async () => {
    const provider = new LLMProvider([fail(new CreditsExhaustedError("429")), ok("fallback")], noopMetrics);
    expect(await provider.call("oi", "sys")).toBe("fallback");
  });

  it("todos falham por créditos → CreditsExhaustedError", async () => {
    const provider = new LLMProvider(
      [fail(new CreditsExhaustedError("a")), fail(new CreditsExhaustedError("b"))],
      noopMetrics,
    );
    await expect(provider.call("oi")).rejects.toBeInstanceOf(CreditsExhaustedError);
  });

  it("falhas não relacionadas a créditos → LLMError, não CreditsExhaustedError", async () => {
    const provider = new LLMProvider([fail(new LLMError("500", 500))], noopMetrics);
    const err = await provider.call("oi").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LLMError);
    expect(err).not.toBeInstanceOf(CreditsExhaustedError);
  });

  it("sem clients → construtor lança", () => {
    expect(() => new LLMProvider([], noopMetrics)).toThrow();
  });

  it("registra log para cada tentativa via MetricsService", async () => {
    const logAttempt = vi.fn();
    const provider = new LLMProvider([fail(new CreditsExhaustedError("erro")), ok("ok")], { logAttempt });

    await provider.call("oi");

    expect(logAttempt).toHaveBeenCalledTimes(2);
    expect(logAttempt).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(logAttempt).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
