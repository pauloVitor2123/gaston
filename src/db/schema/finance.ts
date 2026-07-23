import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { cards } from "./cards";
import { categories } from "./categories";
import { mantras } from "./mantras";
import { users } from "./users";

export const cardInvoices = sqliteTable("card_invoices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  cardId: integer("card_id")
    .notNull()
    .references(() => cards.id),
  cycleStart: integer("cycle_start", { mode: "timestamp" }).notNull(),
  cycleEnd: integer("cycle_end", { mode: "timestamp" }).notNull(),
  dueDate: integer("due_date", { mode: "timestamp" }).notNull(),
  status: text("status", { enum: ["open", "closed", "paid"] }).notNull().default("open"),
  paidAmountCents: integer("paid_amount_cents"),
  paidAt: integer("paid_at", { mode: "timestamp" }),
});

export const recurringBills = sqliteTable("recurring_bills", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  description: text("description").notNull(),
  kind: text("kind", { enum: ["fixed", "subscription"] }).notNull(),
  expectedAmountCents: integer("expected_amount_cents").notNull(),
  dueDay: integer("due_day").notNull(),
  chargeDay: integer("charge_day"),
  paymentMethod: text("payment_method", { enum: ["card", "pix", "cash", "debit"] }).notNull(),
  cardId: integer("card_id").references(() => cards.id),
  categoryId: integer("category_id").references(() => categories.id),
  mantraId: integer("mantra_id").references(() => mantras.id),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

export const installmentPurchases = sqliteTable("installment_purchases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  description: text("description").notNull(),
  totalAmountCents: integer("total_amount_cents").notNull(),
  installmentsCount: integer("installments_count").notNull(),
  purchaseDate: integer("purchase_date", { mode: "timestamp" }).notNull(),
  paymentMethod: text("payment_method", { enum: ["card", "pix", "cash", "debit"] }).notNull(),
  cardId: integer("card_id").references(() => cards.id),
  categoryId: integer("category_id").references(() => categories.id),
  mantraId: integer("mantra_id").references(() => mantras.id),
  direction: text("direction", { enum: ["in", "out"] }).notNull().default("out"),
});

export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    description: text("description").notNull(),
    expectedAmountCents: integer("expected_amount_cents").notNull(),
    actualAmountCents: integer("actual_amount_cents"),
    status: text("status", { enum: ["pending", "settled", "cancelled"] })
      .notNull()
      .default("pending"),
    accrualDate: integer("accrual_date", { mode: "timestamp" }).notNull(),
    dueDate: integer("due_date", { mode: "timestamp" }).notNull(),
    settledAt: integer("settled_at", { mode: "timestamp" }),
    paymentMethod: text("payment_method", { enum: ["card", "pix", "cash", "debit"] }).notNull(),
    cardId: integer("card_id").references(() => cards.id),
    cardInvoiceId: integer("card_invoice_id").references(() => cardInvoices.id),
    categoryId: integer("category_id").references(() => categories.id),
    mantraId: integer("mantra_id").references(() => mantras.id),
    source: text("source", { enum: ["user", "installment", "recurring"] })
      .notNull()
      .default("user"),
    recurringBillId: integer("recurring_bill_id").references(() => recurringBills.id),
    installmentPurchaseId: integer("installment_purchase_id").references(
      () => installmentPurchases.id,
    ),
    installmentNumber: integer("installment_number"),
    note: text("note"),
    rawMessage: text("raw_message"),
  },
  (t) => ({
    idxUserAccrual: index("idx_tx_user_accrual").on(t.userId, t.accrualDate),
    idxInvoice: index("idx_tx_invoice").on(t.cardInvoiceId),
    idxStatusDue: index("idx_tx_status_due").on(t.status, t.dueDate),
  }),
);

export type CardInvoice = typeof cardInvoices.$inferSelect;
export type NewCardInvoice = typeof cardInvoices.$inferInsert;
export type RecurringBill = typeof recurringBills.$inferSelect;
export type NewRecurringBill = typeof recurringBills.$inferInsert;
export type InstallmentPurchase = typeof installmentPurchases.$inferSelect;
export type NewInstallmentPurchase = typeof installmentPurchases.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
