import { describe, expect, it, vi } from "vitest";
import { findOrOpenInvoice, invoiceFor } from "@/services/invoice/invoice";
import type { CardInvoice } from "@/db/schema";

const nubank = { closingDay: 13, dueDay: 20 };
const nubankPJ = { closingDay: 31, dueDay: 7 };

const period = invoiceFor(new Date("2025-01-10"), nubank);

function makeInvoice(overrides: Partial<CardInvoice> = {}): CardInvoice {
  return {
    id: 7,
    userId: 1,
    cardId: 2,
    cycleStart: period.cycle_start,
    cycleEnd: period.cycle_end,
    dueDate: period.due_date,
    status: "open",
    paidAmountCents: null,
    paidAt: null,
    ...overrides,
  };
}

function makeRepo(found: CardInvoice) {
  return {
    findOrCreate: vi.fn().mockResolvedValue(found),
    update: vi.fn().mockResolvedValue(undefined),
  };
}

describe("invoiceFor", () => {
  it("purchase before closing day falls into current cycle, due next month", () => {
    const result = invoiceFor(new Date("2025-01-10"), nubank);

    expect(result.cycle_end).toEqual(new Date("2025-01-13"));
    expect(result.due_date).toEqual(new Date("2025-02-20"));
  });

  it("purchase after closing day falls into next cycle, due two months ahead", () => {
    const result = invoiceFor(new Date("2025-01-15"), nubank);

    expect(result.cycle_end).toEqual(new Date("2025-02-13"));
    expect(result.due_date).toEqual(new Date("2025-03-20"));
  });

  it("purchase on closing day falls into current cycle", () => {
    const result = invoiceFor(new Date("2025-01-13"), nubank);

    expect(result.cycle_end).toEqual(new Date("2025-01-13"));
    expect(result.due_date).toEqual(new Date("2025-02-20"));
  });

  it("closing_day=31 in February clamps cycle_end to last day of month", () => {
    const result = invoiceFor(new Date("2025-02-10"), nubankPJ);

    expect(result.cycle_end).toEqual(new Date("2025-02-28"));
    expect(result.due_date).toEqual(new Date("2025-03-07"));
  });

  it("cycle_start is the day after the previous cycle closed", () => {
    const result = invoiceFor(new Date("2025-01-10"), nubank);

    expect(result.cycle_start).toEqual(new Date("2024-12-14"));
  });

  it("cycle_start after closing day uses current closing as previous boundary", () => {
    const result = invoiceFor(new Date("2025-01-15"), nubank);

    expect(result.cycle_start).toEqual(new Date("2025-01-14"));
  });

  it("closing_day=31 cycle_start lands on day 1 of the cycle month", () => {
    const result = invoiceFor(new Date("2025-02-10"), nubankPJ);

    expect(result.cycle_start).toEqual(new Date("2025-02-01"));
  });
});

describe("findOrOpenInvoice", () => {
  it("returns an already-open invoice untouched", async () => {
    const repo = makeRepo(makeInvoice({ status: "open" }));

    const invoice = await findOrOpenInvoice(repo, 1, 2, period);

    expect(invoice.status).toBe("open");
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("reopens a paid invoice when a new charge lands in its cycle", async () => {
    const repo = makeRepo(makeInvoice({ status: "paid", paidAmountCents: 80000, paidAt: new Date() }));

    const invoice = await findOrOpenInvoice(repo, 1, 2, period);

    expect(repo.update).toHaveBeenCalledWith(1, 7, { status: "open", paidAt: null });
    expect(invoice.status).toBe("open");
    expect(invoice.paidAt).toBeNull();
    expect(invoice.paidAmountCents).toBe(80000);
  });

  it("reopens a closed invoice too", async () => {
    const repo = makeRepo(makeInvoice({ status: "closed" }));

    await findOrOpenInvoice(repo, 1, 2, period);

    expect(repo.update).toHaveBeenCalledWith(1, 7, { status: "open", paidAt: null });
  });
});
