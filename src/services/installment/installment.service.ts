import type {
  ICardInvoiceRepository,
  ICardRepository,
  ICategoryRepository,
  IInstallmentPurchaseRepository,
  IMantraRepository,
  ITransactionRepository,
} from "@/types/repository";
import type { Mantra } from "@/services/collection/draft";
import type { InstallmentPurchase } from "@/db/schema";
import { invoiceFor } from "@/services/invoice/invoice";
import { addMonthsUtc, splitAmountCents } from "@/services/installment/installments";

export interface InstallmentInput {
  description: string;
  total_amount_cents: number;
  installments_count: number;
  card_name: string;
  category_name?: string;
  mantra?: Mantra;
  date?: string;
}

export interface InstallmentResult {
  purchase: InstallmentPurchase;
  installmentCents: number;
  firstDueDate: Date;
}

export class InstallmentPurchaseNotAllowedError extends Error {}

function parseUtcDate(date?: string): Date {
  if (!date) {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
}

export class InstallmentService {
  constructor(
    private readonly categoryRepo: ICategoryRepository,
    private readonly cardRepo: ICardRepository,
    private readonly mantraRepo: IMantraRepository,
    private readonly installmentRepo: IInstallmentPurchaseRepository,
    private readonly transactionRepo: ITransactionRepository,
    private readonly cardInvoiceRepo: ICardInvoiceRepository,
  ) {}

  async create(input: InstallmentInput, userId: number): Promise<InstallmentResult> {
    const purchaseDate = parseUtcDate(input.date);
    const [category, card, mantra] = await Promise.all([
      input.category_name
        ? this.categoryRepo.findByNameOrSynonym(userId, input.category_name)
        : Promise.resolve(null),
      this.cardRepo.findByNameOrAlias(userId, input.card_name),
      input.mantra ? this.mantraRepo.findByName(userId, input.mantra) : Promise.resolve(null),
    ]);

    if (!card) throw new InstallmentPurchaseNotAllowedError("card not found");

    const amounts = splitAmountCents(input.total_amount_cents, input.installments_count);
    const purchase = await this.installmentRepo.create({
      userId,
      description: input.description,
      totalAmountCents: input.total_amount_cents,
      installmentsCount: input.installments_count,
      purchaseDate,
      paymentMethod: "card",
      cardId: card.id,
      categoryId: category?.id,
      mantraId: mantra?.id,
      direction: "out",
    });

    let firstDueDate = purchaseDate;
    for (let i = 0; i < input.installments_count; i++) {
      const period = invoiceFor(addMonthsUtc(purchaseDate, i), card);
      const invoice = await this.cardInvoiceRepo.findOrCreate(
        userId,
        card.id,
        period.cycle_start,
        period.cycle_end,
        period.due_date,
      );
      await this.transactionRepo.create({
        userId,
        direction: "out",
        description: `${input.description} (${i + 1}/${input.installments_count})`,
        expectedAmountCents: amounts[i]!,
        accrualDate: purchaseDate,
        dueDate: period.due_date,
        paymentMethod: "card",
        cardId: card.id,
        cardInvoiceId: invoice.id,
        categoryId: category?.id,
        mantraId: mantra?.id,
        source: "installment",
        installmentPurchaseId: purchase.id,
        installmentNumber: i + 1,
        status: "pending",
      });
      if (i === 0) firstDueDate = period.due_date;
    }

    return { purchase, installmentCents: amounts[0]!, firstDueDate };
  }
}
