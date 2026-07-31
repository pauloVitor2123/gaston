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

export interface TransactionInput {
  direction: Direction;
  description: string;
  amount_cents: number;
  date?: string;
  payment_method?: PaymentMethod;
  card_name?: string;
  category_name?: string;
  mantra?: Mantra;
}

function toAccrualDate(date?: string): Date {
  if (date) {
    const [year, month, day] = date.split("-").map(Number) as [number, number, number];
    return new Date(Date.UTC(year, month - 1, day));
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
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
    let dueDate = accrualDate;

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
      status: "pending",
    });
  }
}
