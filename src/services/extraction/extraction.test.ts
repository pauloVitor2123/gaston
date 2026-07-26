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
};

function makeLlm(response: string): ILLMClient {
  return { call: vi.fn().mockResolvedValue(response) };
}

describe("ExtractionService.extract", () => {
  it("calls llm1 and returns parsed ExtractionResult", async () => {
    const llm1 = makeLlm(JSON.stringify(highConfidenceResult));
    const service = new ExtractionService(llm1, makeLlm(""));

    const result = await service.extract("almoço 35 reais Nubank", context);

    expect(llm1.call).toHaveBeenCalledOnce();
    expect(result).toEqual(highConfidenceResult);
  });

  it("does not call llm2 when category_confidence is high", async () => {
    const llm2 = makeLlm("Alimentação");
    const service = new ExtractionService(makeLlm(JSON.stringify(highConfidenceResult)), llm2);

    await service.extract("almoço 35 reais Nubank", context);

    expect(llm2.call).not.toHaveBeenCalled();
  });

  it("calls llm2 and updates category when confidence is low", async () => {
    const lowConfidence: ExtractionResult = { ...highConfidenceResult, category_confidence: "low" };
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
});
