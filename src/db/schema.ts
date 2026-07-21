import { sql } from "drizzle-orm";
import { check, integer, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

/**
 * Schema Drizzle — FONTE DA VERDADE do banco.
 * drizzle-kit gera as migrations SQL a partir daqui; nunca se escreve DDL à mão.
 *
 * Tradução Postgres (design-tecnico-v2.1) → SQLite/D1:
 *   BIGSERIAL PK  → integer autoincrement
 *   TEXT[]        → text JSON (SQLite não tem array nativo)
 *   NUMERIC       → real
 *   BOOLEAN       → integer (mode boolean)
 *   TIMESTAMPTZ   → integer (mode timestamp, unixepoch)
 *
 * Escopo deste PR: tabelas de config (users, cards, categories, mantras).
 * Tabelas transacionais entram nos PRs das features que as usam.
 */

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
    name: text("name").notNull(), // "Nubank PF", "Nubank PJ"
    aliases: text("aliases", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`), // ["nubank","nu","roxinho"] p/ matching do LLM
    brand: text("brand"), // "Mastercard", "Visa"
    closingDay: integer("closing_day").notNull(), // 31 = "último dia do mês"
    dueDay: integer("due_day").notNull(),
    limitCents: integer("limit_cents"), // nullable
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
    name: text("name").notNull(), // dado do usuário, fica em PT
    synonyms: text("synonyms", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`), // ["almoço","lanche"] → mata deriva de categoria
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
    name: text("name").notNull(), // "Se Pagar", "Doar", "Pagas as Contas"...
    targetPercent: real("target_percent").notNull(), // 0.45, 0.30, 0.10...
  },
  (t) => ({ userNameUnique: unique().on(t.userId, t.name) }),
);

// Tipos inferidos do schema (a fonte da verdade também tipa o código).
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Card = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Mantra = typeof mantras.$inferSelect;
export type NewMantra = typeof mantras.$inferInsert;
