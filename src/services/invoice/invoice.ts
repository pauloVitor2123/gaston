import type { Card } from "@/db/schema/cards";

type CardCycle = Pick<Card, "closingDay" | "dueDay">;

export interface InvoicePeriod {
  cycle_start: Date;
  cycle_end: Date;
  due_date: Date;
}

export function invoiceFor(purchaseDate: Date, card: CardCycle): InvoicePeriod {
  const day = purchaseDate.getUTCDate();
  const month = purchaseDate.getUTCMonth();
  const year = purchaseDate.getUTCFullYear();

  const beforeOrOnClosing = day <= card.closingDay;

  const cycleCloseMonth = beforeOrOnClosing ? month : month + 1;
  const cycle_end = utcLastValidDay(year, cycleCloseMonth, card.closingDay);

  const cycleStartMonth = beforeOrOnClosing ? month - 1 : month;
  const cycle_start = utcDate(year, cycleStartMonth, card.closingDay + 1);

  const dueDateMonth = beforeOrOnClosing ? month + 1 : month + 2;
  const due_date = utcLastValidDay(year, dueDateMonth, card.dueDay);

  return { cycle_start, cycle_end, due_date };
}

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

function utcLastValidDay(year: number, month: number, day: number): Date {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return utcDate(year, month, Math.min(day, lastDay));
}
