import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  telegramChatId: integer("telegram_chat_id").notNull().unique(),
  name: text("name"),
  timezone: text("timezone").notNull().default("America/Sao_Paulo"),
  balanceCents: integer("balance_cents").notNull().default(0),
  balanceSetAt: integer("balance_set_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
