import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const paymentEvents = sqliteTable(
  "payment_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    targetType: text("target_type", { enum: ["transaction", "invoice"] }).notNull(),
    targetId: integer("target_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
    paidAt: integer("paid_at", { mode: "timestamp" }).notNull(),
    voidedAt: integer("voided_at", { mode: "timestamp" }),
  },
  (t) => ({
    idxUserPaid: index("idx_payment_user_paid").on(t.userId, t.paidAt),
    idxTarget: index("idx_payment_target").on(t.targetType, t.targetId),
  }),
);

export type PaymentEvent = typeof paymentEvents.$inferSelect;
export type NewPaymentEvent = typeof paymentEvents.$inferInsert;
