import { describe, expect, it } from "vitest";
import {
  RECORD_TRANSACTION_TOOL,
  transactionDraftSchema,
} from "@/services/collection/draft";

describe("transactionDraftSchema", () => {
  it("accepts a minimal draft with only required fields", () => {
    const parsed = transactionDraftSchema.safeParse({
      intent: "record_expense",
      description: "almoço",
      amount_cents: 3500,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a draft missing the amount", () => {
    const parsed = transactionDraftSchema.safeParse({
      intent: "record_expense",
      description: "almoço",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a draft missing the description", () => {
    const parsed = transactionDraftSchema.safeParse({
      intent: "record_expense",
      amount_cents: 3500,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a negative amount and a malformed date", () => {
    expect(
      transactionDraftSchema.safeParse({
        intent: "record_expense",
        description: "x",
        amount_cents: -1,
      }).success,
    ).toBe(false);
    expect(
      transactionDraftSchema.safeParse({
        intent: "record_expense",
        description: "x",
        amount_cents: 1,
        date: "15/01/2025",
      }).success,
    ).toBe(false);
  });

  it("accepts a zero amount", () => {
    const parsed = transactionDraftSchema.safeParse({
      intent: "record_income",
      description: "estorno",
      amount_cents: 0,
    });
    expect(parsed.success).toBe(true);
  });
});

describe("RECORD_TRANSACTION_TOOL", () => {
  it("exposes a JSON schema with required amount and description", () => {
    const params = RECORD_TRANSACTION_TOOL.parameters as {
      required: string[];
      properties: Record<string, unknown>;
      $schema?: unknown;
    };
    expect(params.required).toEqual(
      expect.arrayContaining(["intent", "description", "amount_cents"]),
    );
    expect(params.properties).toHaveProperty("payment_method");
    expect(params.$schema).toBeUndefined();
  });
});
