import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  integer,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
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
    parentId: integer("parent_id").references((): AnySQLiteColumn => categories.id),
  },
  (t) => ({
    userParentNameUnique: unique().on(t.userId, t.parentId, t.name),
    userTopNameUnique: uniqueIndex("categories_user_top_name_unique")
      .on(t.userId, t.name)
      .where(sql`${t.parentId} is null`),
  }),
);

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
