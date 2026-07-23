import { describe, expect, it } from "vitest";
import { invoiceFor } from "@/services/invoice/invoice";

const nubank = { closingDay: 13, dueDay: 20 };
const nubankPJ = { closingDay: 31, dueDay: 7 };

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
