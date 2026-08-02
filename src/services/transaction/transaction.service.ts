import type {
  ICardInvoiceRepository,
  ICardRepository,
  ICategoryRepository,
  IMantraRepository,
  ITransactionRepository,
} from "@/types/repository";
import type { Direction, Mantra, PaymentMethod } from "@/services/collection/draft";
import type { Transaction } from "@/db/schema";
import { invoiceFor } from "@/services/invoice/invoice";
import { parseUtcDate, todayUtcMidnight } from "@/services/dates";

export interface TransactionInput {
  direction: Direction;
  description: string;
  amount_cents: number;
  date?: string;
  due_date?: string;
  already_paid?: boolean;
  payment_method?: PaymentMethod;
  card_name?: string;
  category_name?: string;
  mantra?: Mantra;
}

function toAccrualDate(date?: string): Date {
  return date ? parseUtcDate(date) : todayUtcMidnight();
}

export function settlesOnRecord(alreadyPaid: boolean | undefined, dueDate: Date): boolean {
  if (alreadyPaid !== undefined) return alreadyPaid;
  return dueDate.getTime() <= todayUtcMidnight().getTime();
}

export class TransactionService {
  constructor(
    private readonly categoryRepo: ICategoryRepository,
    private readonly cardRepo: ICardRepository,
    private readonly mantraRepo: IMantraRepository,
    private readonly transactionRepo: ITransactionRepository,
    private readonly cardInvoiceRepo: ICardInvoiceRepository,
  ) {}

  async persist(input: TransactionInput, userId: number, rawMessage: string): Promise<Transaction> {
    const accrualDate = toAccrualDate(input.date);

    const [category, card, mantra] = await Promise.all([
      input.category_name
        ? this.categoryRepo.findByNameOrSynonym(userId, input.category_name)
        : Promise.resolve(null),
      input.card_name
        ? this.cardRepo.findByNameOrAlias(userId, input.card_name)
        : Promise.resolve(null),
      input.mantra
        ? this.mantraRepo.findByName(userId, input.mantra)
        : Promise.resolve(null),
    ]);

    let cardInvoiceId: number | undefined;
    let dueDate = input.due_date ? parseUtcDate(input.due_date) : accrualDate;
    let status: Transaction["status"] = "pending";
    let settledAt: Date | undefined;
    let actualAmountCents: number | undefined;

    if (input.payment_method === "card" && card) {
      const period = invoiceFor(accrualDate, card);
      const invoice = await this.cardInvoiceRepo.findOrCreate(
        userId,
        card.id,
        period.cycle_start,
        period.cycle_end,
        period.due_date,
      );
      cardInvoiceId = invoice.id;
      dueDate = period.due_date;
    } else if (settlesOnRecord(input.already_paid, dueDate)) {
      status = "settled";
      settledAt = new Date();
      actualAmountCents = input.amount_cents;
    }

    return this.transactionRepo.create({
      userId,
      direction: input.direction,
      description: input.description,
      expectedAmountCents: input.amount_cents,
      accrualDate,
      dueDate,
      paymentMethod: input.payment_method ?? "cash",
      cardId: card?.id,
      cardInvoiceId,
      categoryId: category?.id,
      mantraId: mantra?.id,
      source: "user",
      rawMessage,
      status,
      settledAt,
      actualAmountCents,
    });
  }
}
