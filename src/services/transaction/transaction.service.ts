import type {
  ICategoryRepository,
  IMantraRepository,
  ITransactionRepository,
} from "@/types/repository";
import type { Mantra } from "@/services/collection/draft";
import type { Transaction } from "@/db/schema";
import type { Clock } from "@/services/clock";
import { parseUtcDate } from "@/services/dates";

export interface TransactionInput {
  description: string;
  amount_cents: number;
  date?: string;
  category_name?: string;
  mantra?: Mantra;
}

export class TransactionService {
  constructor(
    private readonly categoryRepo: ICategoryRepository,
    private readonly mantraRepo: IMantraRepository,
    private readonly transactionRepo: ITransactionRepository,
    private readonly clock: Clock,
  ) {}

  async persist(
    input: TransactionInput,
    userId: number,
    rawMessage: string,
    today: Date,
  ): Promise<Transaction> {
    const accrualDate = input.date ? parseUtcDate(input.date) : today;

    const [category, mantra] = await Promise.all([
      input.category_name
        ? this.categoryRepo.findByNameOrSynonym(userId, input.category_name)
        : Promise.resolve(null),
      input.mantra
        ? this.mantraRepo.findByName(userId, input.mantra)
        : Promise.resolve(null),
    ]);

    const now = this.clock.now();
    return this.transactionRepo.create({
      userId,
      direction: "out",
      description: input.description,
      expectedAmountCents: input.amount_cents,
      actualAmountCents: input.amount_cents,
      accrualDate,
      dueDate: accrualDate,
      paymentMethod: "cash",
      categoryId: category?.id,
      mantraId: mantra?.id,
      source: "user",
      rawMessage,
      status: "settled",
      settledAt: now,
    });
  }
}
