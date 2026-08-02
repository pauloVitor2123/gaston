import type { NewTransaction, RecurringBill } from "@/db/schema";
import { startOfUtcDay, utcDayClamped } from "@/services/dates";

export function occurrenceOnOrAfter(today: Date, dueDay: number): Date {
  const thisMonth = utcDayClamped(today.getUTCFullYear(), today.getUTCMonth(), dueDay);
  if (thisMonth.getTime() >= startOfUtcDay(today).getTime()) return thisMonth;
  return utcDayClamped(today.getUTCFullYear(), today.getUTCMonth() + 1, dueDay);
}

export function nextOccurrence(dueDate: Date, dueDay: number): Date {
  return utcDayClamped(dueDate.getUTCFullYear(), dueDate.getUTCMonth() + 1, dueDay);
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
