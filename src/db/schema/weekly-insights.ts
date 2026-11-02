import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export interface InsightItem {
  hypothesis: string;
  suggestion: string;
}

export const weeklyInsights = sqliteTable(
  "weekly_insights",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    weekStart: integer("week_start", { mode: "timestamp" }).notNull(),
    fingerprint: text("fingerprint").notNull(),
    content: text("content", { mode: "json" }).$type<InsightItem[]>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    userWeekUnique: unique().on(t.userId, t.weekStart),
  }),
);

export type WeeklyInsight = typeof weeklyInsights.$inferSelect;
export type NewWeeklyInsight = typeof weeklyInsights.$inferInsert;
