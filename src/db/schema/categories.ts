import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { users } from "./users";

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

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
