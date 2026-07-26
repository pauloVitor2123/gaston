import type {
  ICardInvoiceRepository,
  ICardRepository,
  ICategoryRepository,
  IMantraRepository,
  ITransactionRepository,
} from "@/types/repository";
import type { ExtractionResult } from "@/services/extraction/types";
import type { Transaction } from "@/db/schema";
import { invoiceFor } from "@/services/invoice/invoice";

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

  async persist(result: ExtractionResult, userId: number, rawMessage: string): Promise<Transaction> {
    const accrualDate = toAccrualDate(result.date);

    const [category, card, mantra] = await Promise.all([
      result.category_name
        ? this.categoryRepo.findByNameOrSynonym(userId, result.category_name)
        : Promise.resolve(null),
      result.card_name
        ? this.cardRepo.findByNameOrAlias(userId, result.card_name)
        : Promise.resolve(null),
      result.mantra
        ? this.mantraRepo.findByName(userId, result.mantra)
        : Promise.resolve(null),
    ]);

    let cardInvoiceId: number | undefined;
    let dueDate = accrualDate;

    if (result.payment_method === "card" && card) {
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
      direction: result.direction,
      description: result.description!,
      expectedAmountCents: result.amount_cents!,
      accrualDate,
      dueDate,
      paymentMethod: result.payment_method ?? "cash",
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
