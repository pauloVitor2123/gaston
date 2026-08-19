import type {
  ICategoryRepository,
  IMantraRepository,
  IRecurringBillRepository,
  ITransactionRepository,
} from "@/types/repository";
import type { Mantra, PaymentMethod } from "@/services/collection/draft";
import type { RecurringBill } from "@/db/schema";
import { materializedBill, occurrenceOnOrAfter } from "@/services/recurring/recurring";

type RecurringMethod = Exclude<PaymentMethod, "card">;

export interface RecurringBillInput {
  description: string;
  amount_cents: number;
  due_day: number;
  kind?: "fixed" | "subscription";
  payment_method?: RecurringMethod;
  category_name?: string;
  mantra?: Mantra;
}

export interface RecurringBillResult {
  bill: RecurringBill;
  firstDueDate: Date;
}

export class RecurringBillService {
  constructor(
    private readonly categoryRepo: ICategoryRepository,
    private readonly mantraRepo: IMantraRepository,
    private readonly recurringBillRepo: IRecurringBillRepository,
    private readonly transactionRepo: ITransactionRepository,
  ) {}

  async create(input: RecurringBillInput, userId: number, today: Date): Promise<RecurringBillResult> {
    const [category, mantra] = await Promise.all([
      input.category_name
        ? this.categoryRepo.findByNameOrSynonym(userId, input.category_name)
        : Promise.resolve(null),
      input.mantra ? this.mantraRepo.findByName(userId, input.mantra) : Promise.resolve(null),
    ]);

    const bill = await this.recurringBillRepo.create({
      userId,
      description: input.description,
      kind: input.kind ?? "fixed",
      expectedAmountCents: input.amount_cents,
      dueDay: input.due_day,
      paymentMethod: input.payment_method ?? "cash",
      categoryId: category?.id,
      mantraId: mantra?.id,
      isActive: true,
    });

    const firstDueDate = occurrenceOnOrAfter(today, bill.dueDay);
    await this.transactionRepo.create(materializedBill(bill, firstDueDate));

    return { bill, firstDueDate };
  }

  async listActive(userId: number): Promise<RecurringBill[]> {
    return this.recurringBillRepo.listActive(userId);
  }

  async delete(userId: number, billId: number): Promise<void> {
    await this.recurringBillRepo.deactivate(userId, billId);
    const occurrences = await this.transactionRepo.listByRecurringBill(userId, billId);
    const open = occurrences.find((t) => t.status === "pending");
    if (open) await this.transactionRepo.update(userId, open.id, { status: "cancelled" });
  }
}
