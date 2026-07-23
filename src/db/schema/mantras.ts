import { integer, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { users } from "./users";

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

export type Mantra = typeof mantras.$inferSelect;
export type NewMantra = typeof mantras.$inferInsert;
