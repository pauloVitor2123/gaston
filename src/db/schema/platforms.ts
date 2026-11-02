import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const platforms = sqliteTable(
  "platforms",
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
  (t) => ({
    userNameUnique: unique().on(t.userId, t.name),
  }),
);

export type Platform = typeof platforms.$inferSelect;
export type NewPlatform = typeof platforms.$inferInsert;
