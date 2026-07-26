import { ExtractionError } from "@/services/extraction/errors";
import type { ExtractionResult } from "@/services/extraction/types";

const VALID_INTENTS = new Set(["record_expense", "record_income", "query_balance", "mark_paid", "unknown"]);
const VALID_DIRECTIONS = new Set(["in", "out"]);
const VALID_CONFIDENCES = new Set(["high", "low"]);
const VALID_PAYMENT_METHODS = new Set(["card", "pix", "cash", "debit"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateExtractionResult(raw: unknown): ExtractionResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ExtractionError(`LLM output is not an object: ${JSON.stringify(raw)}`);
  }

  const r = raw as Record<string, unknown>;

  if (!VALID_INTENTS.has(r.intent as string)) {
    throw new ExtractionError(`Invalid intent: ${r.intent}`);
  }
  if (!VALID_DIRECTIONS.has(r.direction as string)) {
    throw new ExtractionError(`Invalid direction: ${r.direction}`);
  }
  if (!VALID_CONFIDENCES.has(r.category_confidence as string)) {
    throw new ExtractionError(`Invalid category_confidence: ${r.category_confidence}`);
  }
  if (r.payment_method != null && !VALID_PAYMENT_METHODS.has(r.payment_method as string)) {
    throw new ExtractionError(`Invalid payment_method: ${r.payment_method}`);
  }
  if (r.amount_cents != null) {
    const v = r.amount_cents as number;
    if (!Number.isInteger(v) || v < 0) {
      throw new ExtractionError(`Invalid amount_cents: ${v}`);
    }
  }
  if (r.date != null && !DATE_RE.test(r.date as string)) {
    throw new ExtractionError(`Invalid date format: ${r.date}`);
  }
  if (r.installments_count != null) {
    const v = r.installments_count as number;
    if (!Number.isInteger(v) || v <= 0) {
      throw new ExtractionError(`Invalid installments_count: ${v}`);
    }
  }

  return raw as ExtractionResult;
}
