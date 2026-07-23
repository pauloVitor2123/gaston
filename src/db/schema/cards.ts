import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const cards = sqliteTable(
  "cards",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    aliases: text("aliases", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    brand: text("brand"),
    closingDay: integer("closing_day").notNull(),
    dueDay: integer("due_day").notNull(),
    limitCents: integer("limit_cents"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    userNameUnique: unique().on(t.userId, t.name),
    closingDayRange: check("cards_closing_day_range", sql`${t.closingDay} between 1 and 31`),
    dueDayRange: check("cards_due_day_range", sql`${t.dueDay} between 1 and 31`),
  }),
);

export type Card = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;
