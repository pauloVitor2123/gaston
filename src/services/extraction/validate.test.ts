import { describe, expect, it } from "vitest";
import { ExtractionError } from "@/services/extraction/errors";
import { validateExtractionResult } from "@/services/extraction/validate";
import type { ExtractionResult } from "@/services/extraction/types";

const base: ExtractionResult = {
  intent: "record_expense",
  direction: "out",
  category_confidence: "high",
};

describe("validateExtractionResult", () => {
  it("accepts a minimal valid result", () => {
    expect(validateExtractionResult(base)).toEqual(base);
  });

  it("accepts a fully populated valid result", () => {
    const full: ExtractionResult = {
      intent: "record_income",
      description: "salario",
      amount_cents: 500000,
      date: "2025-07-15",
      payment_method: "pix",
      card_name: null,
      category_name: "Salário",
      category_confidence: "high",
      installments_count: undefined,
      direction: "in",
    };
    expect(validateExtractionResult(full)).toEqual(full);
  });

  it("throws on unknown intent", () => {
    expect(() => validateExtractionResult({ ...base, intent: "hack" })).toThrow(ExtractionError);
  });

  it("throws on unknown direction", () => {
    expect(() => validateExtractionResult({ ...base, direction: "sideways" })).toThrow(ExtractionError);
  });

  it("throws on unknown category_confidence", () => {
    expect(() => validateExtractionResult({ ...base, category_confidence: "medium" })).toThrow(
      ExtractionError,
    );
  });

  it("throws on unknown payment_method", () => {
    expect(() => validateExtractionResult({ ...base, payment_method: "crypto" })).toThrow(ExtractionError);
  });

  it("accepts valid payment methods", () => {
    for (const pm of ["card", "pix", "cash", "debit"] as const) {
      expect(() => validateExtractionResult({ ...base, payment_method: pm })).not.toThrow();
    }
  });

  it("throws on negative amount_cents", () => {
    expect(() => validateExtractionResult({ ...base, amount_cents: -1 })).toThrow(ExtractionError);
  });

  it("throws on non-integer amount_cents", () => {
    expect(() => validateExtractionResult({ ...base, amount_cents: 10.5 })).toThrow(ExtractionError);
  });

  it("accepts zero amount_cents", () => {
    expect(() => validateExtractionResult({ ...base, amount_cents: 0 })).not.toThrow();
  });

  it("throws on malformed date", () => {
    expect(() => validateExtractionResult({ ...base, date: "15/07/2025" })).toThrow(ExtractionError);
  });

  it("accepts valid YYYY-MM-DD date", () => {
    expect(() => validateExtractionResult({ ...base, date: "2025-07-15" })).not.toThrow();
  });

  it("throws on non-integer installments_count", () => {
    expect(() => validateExtractionResult({ ...base, installments_count: 1.5 })).toThrow(ExtractionError);
  });

  it("throws on zero installments_count", () => {
    expect(() => validateExtractionResult({ ...base, installments_count: 0 })).toThrow(ExtractionError);
  });

  it("throws on negative installments_count", () => {
    expect(() => validateExtractionResult({ ...base, installments_count: -3 })).toThrow(ExtractionError);
  });

  it("throws when input is not an object", () => {
    expect(() => validateExtractionResult("texto aleatorio")).toThrow(ExtractionError);
    expect(() => validateExtractionResult(null)).toThrow(ExtractionError);
    expect(() => validateExtractionResult(42)).toThrow(ExtractionError);
  });
});
