import type { NewTransaction, RecurringBill } from "@/db/schema";

function utcDay(year: number, monthIndex: number, day: number): Date {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, monthIndex, Math.min(day, lastDay)));
}

function utcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function occurrenceOnOrAfter(today: Date, dueDay: number): Date {
  const thisMonth = utcDay(today.getUTCFullYear(), today.getUTCMonth(), dueDay);
  if (thisMonth.getTime() >= utcMidnight(today).getTime()) return thisMonth;
  return utcDay(today.getUTCFullYear(), today.getUTCMonth() + 1, dueDay);
}

export function nextOccurrence(dueDate: Date, dueDay: number): Date {
  return utcDay(dueDate.getUTCFullYear(), dueDate.getUTCMonth() + 1, dueDay);
}

export function materializedBill(bill: RecurringBill, dueDate: Date): NewTransaction {
  return {
    userId: bill.userId,
    direction: "out",
    description: bill.description,
    expectedAmountCents: bill.expectedAmountCents,
    accrualDate: dueDate,
    dueDate,
    paymentMethod: bill.paymentMethod,
    categoryId: bill.categoryId ?? undefined,
    mantraId: bill.mantraId ?? undefined,
    source: "recurring",
    recurringBillId: bill.id,
    status: "pending",
  };
}
