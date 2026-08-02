import { describe, expect, it } from "vitest";
import type { RecurringBill } from "@/db/schema";
import { materializedBill, nextOccurrence, occurrenceOnOrAfter } from "@/services/recurring/recurring";

const bill: RecurringBill = {
  id: 7,
  userId: 1,
  description: "Internet",
  kind: "fixed",
  expectedAmountCents: 29900,
  dueDay: 15,
  chargeDay: null,
  paymentMethod: "pix",
  cardId: null,
  categoryId: 3,
  mantraId: 4,
  isActive: true,
} as RecurringBill;

describe("occurrenceOnOrAfter", () => {
  it("returns this month's due day when it has not passed yet", () => {
    const result = occurrenceOnOrAfter(new Date(Date.UTC(2026, 7, 1)), 15);
    expect(result).toEqual(new Date(Date.UTC(2026, 7, 15)));
  });

  it("rolls to next month when the due day already passed", () => {
    const result = occurrenceOnOrAfter(new Date(Date.UTC(2026, 7, 20)), 15);
    expect(result).toEqual(new Date(Date.UTC(2026, 8, 15)));
  });

  it("includes today when today is the due day", () => {
    const result = occurrenceOnOrAfter(new Date(Date.UTC(2026, 7, 15)), 15);
    expect(result).toEqual(new Date(Date.UTC(2026, 7, 15)));
  });

  it("clamps the due day to the last day of a short month", () => {
    const result = occurrenceOnOrAfter(new Date(Date.UTC(2026, 1, 1)), 31);
    expect(result).toEqual(new Date(Date.UTC(2026, 1, 28)));
  });
});

describe("nextOccurrence", () => {
  it("advances one month keeping the due day", () => {
    expect(nextOccurrence(new Date(Date.UTC(2026, 7, 15)), 15)).toEqual(
      new Date(Date.UTC(2026, 8, 15)),
    );
  });

  it("crosses the year boundary", () => {
    expect(nextOccurrence(new Date(Date.UTC(2026, 11, 15)), 15)).toEqual(
      new Date(Date.UTC(2027, 0, 15)),
    );
  });
});

describe("materializedBill", () => {
  it("builds a pending recurring transaction copying the bill's fields", () => {
    const due = new Date(Date.UTC(2026, 7, 15));
    const tx = materializedBill(bill, due);
    expect(tx).toMatchObject({
      userId: 1,
      direction: "out",
      description: "Internet",
      expectedAmountCents: 29900,
      accrualDate: due,
      dueDate: due,
      paymentMethod: "pix",
      categoryId: 3,
      mantraId: 4,
      source: "recurring",
      recurringBillId: 7,
      status: "pending",
    });
  });
});
