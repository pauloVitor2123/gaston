import { describe, expect, it, vi } from "vitest";
import type { ILLMClient } from "@/types/llm";
import { ExtractionService } from "@/services/extraction/extraction";
import { ExtractionError } from "@/services/extraction/errors";
import type { ExtractionContext, ExtractionResult } from "@/services/extraction/types";

const context: ExtractionContext = {
  categories: ["Alimentação", "Transporte", "Lazer"],
  cards: ["Nubank", "Nubank PJ"],
  today: "2025-01-15",
};

const highConfidenceResult: ExtractionResult = {
  intent: "record_expense",
  description: "almoço",
  amount_cents: 3500,
  date: "2025-01-15",
  payment_method: "card",
  card_name: "Nubank",
  category_name: "Alimentação",
  category_confidence: "high",
  direction: "out",
  mantra: "Pagas as Contas",
};

function makeLlm(response: string): ILLMClient {
  return { call: vi.fn().mockResolvedValue(response) };
}

const llm1Response: ExtractionResult = { ...highConfidenceResult, mantra: undefined };

describe("ExtractionService.extract", () => {
  it("calls llm1 and returns parsed ExtractionResult with mantra", async () => {
    const llm1 = makeLlm(JSON.stringify(llm1Response));
    const service = new ExtractionService(llm1, makeLlm(""));

    const result = await service.extract("almoço 35 reais Nubank", context);

    expect(llm1.call).toHaveBeenCalledOnce();
    expect(result).toEqual(highConfidenceResult);
  });

  it("does not call llm2 when category_confidence is high", async () => {
    const llm2 = makeLlm("Alimentação");
    const service = new ExtractionService(makeLlm(JSON.stringify(llm1Response)), llm2);

    await service.extract("almoço 35 reais Nubank", context);

    expect(llm2.call).not.toHaveBeenCalled();
  });

  it("calls llm2 and updates category when confidence is low", async () => {
    const lowConfidence: ExtractionResult = { ...llm1Response, category_confidence: "low" };
    const llm2 = makeLlm("Alimentação");
    const service = new ExtractionService(makeLlm(JSON.stringify(lowConfidence)), llm2);

    const result = await service.extract("almoço 35 reais Nubank", context);

    expect(llm2.call).toHaveBeenCalledOnce();
    expect(result.category_name).toBe("Alimentação");
    expect(result.category_confidence).toBe("high");
  });

  it("throws ExtractionError when llm1 returns malformed JSON", async () => {
    const service = new ExtractionService(makeLlm("isso não é JSON"), makeLlm(""));

    await expect(service.extract("qualquer coisa", context)).rejects.toThrow(ExtractionError);
  });

  it("normalizes card_name to undefined when LLM returns unknown card", async () => {
    const withUnknownCard: ExtractionResult = { ...llm1Response, card_name: "Itaú" };
    const service = new ExtractionService(makeLlm(JSON.stringify(withUnknownCard)), makeLlm(""));

    const result = await service.extract("almoço 35 reais Itaú", context);

    expect(result.card_name).toBeUndefined();
  });

  it("preserves card_name when LLM returns a known card (case-insensitive)", async () => {
    const withLowerCase: ExtractionResult = { ...llm1Response, card_name: "nubank" };
    const service = new ExtractionService(makeLlm(JSON.stringify(withLowerCase)), makeLlm(""));

    const result = await service.extract("almoço 35 reais nubank", context);

    expect(result.card_name).toBe("Nubank");
  });

  it("downgrades category_confidence to low when category not in context, triggering llm2", async () => {
    const withUnknownCategory: ExtractionResult = {
      ...llm1Response,
      category_name: "Tecnologia",
      category_confidence: "high",
    };
    const llm2 = makeLlm("Lazer");
    const service = new ExtractionService(makeLlm(JSON.stringify(withUnknownCategory)), llm2);

    const result = await service.extract("comprei um jogo", context);

    expect(llm2.call).toHaveBeenCalledOnce();
    expect(result.category_name).toBe("Lazer");
  });

  it("sets mantra via applyMantraRules based on description", async () => {
    const donation: ExtractionResult = { ...llm1Response, description: "dízimo da igreja" };
    const service = new ExtractionService(makeLlm(JSON.stringify(donation)), makeLlm(""));

    const result = await service.extract("dízimo 200 reais", context);

    expect(result.mantra).toBe("Doar");
  });

  it("normalizes direction to match intent when LLM disagrees", async () => {
    const inconsistent: ExtractionResult = {
      ...llm1Response,
      intent: "record_expense",
      direction: "in",
    };
    const service = new ExtractionService(makeLlm(JSON.stringify(inconsistent)), makeLlm(""));

    const result = await service.extract("almoço 35 reais Nubank", context);

    expect(result.direction).toBe("out");
  });

  it("preserves direction for intents without a fixed direction", async () => {
    const query: ExtractionResult = {
      ...llm1Response,
      intent: "query_balance",
      direction: "in",
    };
    const service = new ExtractionService(makeLlm(JSON.stringify(query)), makeLlm(""));

    const result = await service.extract("quanto gastei?", context);

    expect(result.direction).toBe("in");
  });
});
