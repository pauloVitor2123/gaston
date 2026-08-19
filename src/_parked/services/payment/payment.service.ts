import type {
  ICardInvoiceRepository,
  IPaymentEventRepository,
  IRecurringBillRepository,
  ITransactionRepository,
} from "@/types/repository";
import type { PaymentEvent, Transaction } from "@/db/schema";
import type { Clock } from "@/services/clock";
import { PaymentError } from "@/services/payment/errors";
import { materializedBill, nextOccurrence } from "@/services/recurring/recurring";

export type PayableType = PaymentEvent["targetType"];

export interface Payable {
  type: PayableType;
  id: number;
  description: string;
  amountCents: number;
  dueDate: Date;
}

export interface PaymentTarget {
  type: PayableType;
  id: number;
}

export interface PaymentResult {
  eventId: number;
  type: PayableType;
  description: string;
  amountCents: number;
  fullyPaid: boolean;
}

export interface UndoResult {
  type: PayableType;
  description: string;
  amountCents: number;
}

export interface RecentPayment {
  eventId: number;
  description: string;
  amountCents: number;
  paidAt: Date;
}

const INVOICE_LABEL = "Fatura do cartão";

function sumAmount<T extends { amountCents: number }>(rows: T[]): number {
  return rows.reduce((total, row) => total + row.amountCents, 0);
}

export class PaymentService {
  constructor(
    private readonly transactionRepo: ITransactionRepository,
    private readonly cardInvoiceRepo: ICardInvoiceRepository,
    private readonly paymentEventRepo: IPaymentEventRepository,
    private readonly recurringBillRepo: IRecurringBillRepository,
    private readonly clock: Clock,
  ) {}

  async listPayables(userId: number): Promise<Payable[]> {
    const [transactions, invoices] = await Promise.all([
      this.transactionRepo.listPayable(userId),
      this.cardInvoiceRepo.listOpen(userId),
    ]);

    const transactionPayables: Payable[] = transactions.map((t) => ({
      type: "transaction",
      id: t.id,
      description: t.description,
      amountCents: t.expectedAmountCents,
      dueDate: t.dueDate,
    }));

    const invoicePayables: Payable[] = [];
    for (const invoice of invoices) {
      const remaining = await this.invoiceRemaining(userId, invoice.id, invoice.paidAmountCents);
      if (remaining > 0) {
        invoicePayables.push({
          type: "invoice",
          id: invoice.id,
          description: INVOICE_LABEL,
          amountCents: remaining,
          dueDate: invoice.dueDate,
        });
      }
    }

    return [...transactionPayables, ...invoicePayables];
  }

  async listRecentPayments(userId: number, limit: number): Promise<RecentPayment[]> {
    const events = await this.paymentEventRepo.listRecentByUser(userId, limit);
    return events.map((e) => ({
      eventId: e.id,
      description: e.description,
      amountCents: e.amountCents,
      paidAt: e.paidAt,
    }));
  }

  async pay(userId: number, target: PaymentTarget, amountCents?: number): Promise<PaymentResult> {
    return target.type === "transaction"
      ? this.payTransaction(userId, target.id, amountCents)
      : this.payInvoice(userId, target.id, amountCents);
  }

  async undo(userId: number, eventId: number): Promise<UndoResult> {
    const event = await this.paymentEventRepo.findById(userId, eventId);
    if (!event || event.voidedAt) {
      throw new PaymentError("Pagamento não encontrado ou já desfeito.");
    }

    if (event.targetType === "transaction") {
      const transaction = await this.transactionRepo.findById(userId, event.targetId);
      if (transaction) await this.rollBackRecurringChain(userId, transaction);
    }

    await this.paymentEventRepo.void(event.id, this.clock.now());

    if (event.targetType === "transaction") {
      await this.transactionRepo.update(userId, event.targetId, {
        status: "pending",
        actualAmountCents: null,
        settledAt: null,
      });
    } else {
      await this.recomputeInvoice(userId, event.targetId);
    }

    return { type: event.targetType, description: event.description, amountCents: event.amountCents };
  }

  private async rollBackRecurringChain(userId: number, transaction: Transaction): Promise<void> {
    if (transaction.source !== "recurring" || !transaction.recurringBillId) return;

    const occurrences = await this.transactionRepo.listByRecurringBill(userId, transaction.recurringBillId);
    const later = occurrences.filter(
      (o) => o.dueDate.getTime() > transaction.dueDate.getTime() && o.status !== "cancelled",
    );
    if (later.some((o) => o.status === "settled")) {
      throw new PaymentError("Desfaça primeiro o pagamento do mês mais recente.");
    }
    for (const occurrence of later) {
      await this.transactionRepo.update(userId, occurrence.id, { status: "cancelled" });
    }
  }

  private async payTransaction(
    userId: number,
    id: number,
    amountCents?: number,
  ): Promise<PaymentResult> {
    const transaction = await this.transactionRepo.findById(userId, id);
    if (!transaction) throw new PaymentError("Lançamento não encontrado.");
    if (transaction.status !== "pending") throw new PaymentError("Esse lançamento não está pendente.");
    if (transaction.paymentMethod === "card") {
      throw new PaymentError("Gasto no cartão é pago pela fatura, não avulso.");
    }

    const actual = amountCents ?? transaction.expectedAmountCents;
    const now = this.clock.now();
    const event = await this.paymentEventRepo.create({
      userId,
      targetType: "transaction",
      targetId: id,
      description: transaction.description,
      amountCents: actual,
      paidAt: now,
    });
    await this.transactionRepo.update(userId, id, {
      status: "settled",
      actualAmountCents: actual,
      settledAt: now,
    });

    await this.advanceRecurring(userId, transaction);

    return {
      eventId: event.id,
      type: "transaction",
      description: transaction.description,
      amountCents: actual,
      fullyPaid: true,
    };
  }

  private async advanceRecurring(userId: number, transaction: Transaction): Promise<void> {
    if (transaction.source !== "recurring" || !transaction.recurringBillId) return;

    const bill = await this.recurringBillRepo.findById(userId, transaction.recurringBillId);
    if (!bill?.isActive) return;

    const nextDue = nextOccurrence(transaction.dueDate, bill.dueDay);
    const occurrences = await this.transactionRepo.listByRecurringBill(userId, bill.id);
    const alreadyRolled = occurrences.some(
      (o) => o.status !== "cancelled" && o.dueDate.getTime() >= nextDue.getTime(),
    );
    if (!alreadyRolled) await this.transactionRepo.create(materializedBill(bill, nextDue));
  }

  private async payInvoice(
    userId: number,
    id: number,
    amountCents?: number,
  ): Promise<PaymentResult> {
    const invoice = await this.cardInvoiceRepo.findById(userId, id);
    if (!invoice) throw new PaymentError("Fatura não encontrada.");
    if (invoice.status !== "open") throw new PaymentError("Essa fatura não está aberta.");

    const total = await this.invoiceTotal(userId, id);
    const alreadyPaid = sumAmount(await this.paymentEventRepo.listByTarget(userId, "invoice", id));
    const remaining = total - alreadyPaid;
    if (remaining <= 0) throw new PaymentError("Essa fatura já está paga.");

    const payAmount = Math.min(amountCents ?? remaining, remaining);
    const now = this.clock.now();
    const event = await this.paymentEventRepo.create({
      userId,
      targetType: "invoice",
      targetId: id,
      description: INVOICE_LABEL,
      amountCents: payAmount,
      paidAt: now,
    });

    const paidNow = alreadyPaid + payAmount;
    const fullyPaid = paidNow >= total;
    await this.cardInvoiceRepo.update(userId, id, {
      paidAmountCents: paidNow,
      status: fullyPaid ? "paid" : "open",
      paidAt: fullyPaid ? now : null,
    });

    if (fullyPaid) {
      await this.settleInvoiceChildren(userId, id, now);
    }

    return {
      eventId: event.id,
      type: "invoice",
      description: INVOICE_LABEL,
      amountCents: payAmount,
      fullyPaid,
    };
  }

  private async recomputeInvoice(userId: number, invoiceId: number): Promise<void> {
    const total = await this.invoiceTotal(userId, invoiceId);
    const paid = sumAmount(await this.paymentEventRepo.listByTarget(userId, "invoice", invoiceId));
    const fullyPaid = paid >= total;

    await this.cardInvoiceRepo.update(userId, invoiceId, {
      paidAmountCents: paid,
      status: fullyPaid ? "paid" : "open",
      paidAt: fullyPaid ? this.clock.now() : null,
    });

    if (!fullyPaid) {
      const children = await this.transactionRepo.listByInvoice(userId, invoiceId);
      for (const child of children) {
        await this.transactionRepo.update(userId, child.id, { status: "pending", settledAt: null });
      }
    }
  }

  private async settleInvoiceChildren(userId: number, invoiceId: number, at: Date): Promise<void> {
    const children = await this.transactionRepo.listByInvoice(userId, invoiceId);
    for (const child of children) {
      await this.transactionRepo.update(userId, child.id, { status: "settled", settledAt: at });
    }
  }

  private async invoiceTotal(userId: number, invoiceId: number): Promise<number> {
    const children = await this.transactionRepo.listByInvoice(userId, invoiceId);
    return children.reduce((total, child) => total + child.expectedAmountCents, 0);
  }

  private async invoiceRemaining(
    userId: number,
    invoiceId: number,
    paidAmountCents: number | null,
  ): Promise<number> {
    const total = await this.invoiceTotal(userId, invoiceId);
    return total - (paidAmountCents ?? 0);
  }
}
