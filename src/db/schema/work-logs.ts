import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const workLogs = sqliteTable(
  "work_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    period: text("period", { enum: ["day", "week"] }).notNull(),
    periodStart: integer("period_start", { mode: "timestamp" }).notNull(),
    km: real("km"),
    onlineMinutes: integer("online_minutes"),
    rides: integer("rides"),
    status: text("status", { enum: ["active", "cancelled"] }).notNull().default("active"),
    batchId: text("batch_id"),
    rawMessage: text("raw_message"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    idxUserPeriod: index("idx_work_logs_user_period").on(t.userId, t.periodStart),
    idxUserBatch: index("idx_work_logs_user_batch").on(t.userId, t.batchId),
  }),
);

export type WorkLog = typeof workLogs.$inferSelect;
export type NewWorkLog = typeof workLogs.$inferInsert;
