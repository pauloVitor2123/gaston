import { sql } from "drizzle-orm";
import { check, integer, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  telegramChatId: integer("telegram_chat_id").notNull().unique(),
  name: text("name"),
  timezone: text("timezone").notNull().default("America/Sao_Paulo"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

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

export const categories = sqliteTable(
  "categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    synonyms: text("synonyms", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
  },
  (t) => ({ userNameUnique: unique().on(t.userId, t.name) }),
);

export const mantras = sqliteTable(
  "mantras",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    targetPercent: real("target_percent").notNull(),
  },
  (t) => ({ userNameUnique: unique().on(t.userId, t.name) }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Card = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Mantra = typeof mantras.$inferSelect;
export type NewMantra = typeof mantras.$inferInsert;
