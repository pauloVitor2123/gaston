import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const llmCallLogs = sqliteTable(
  "llm_call_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").references(() => users.id),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    success: integer("success", { mode: "boolean" }).notNull(),
    error: text("error"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    idxUserCreated: index("idx_logs_user_created").on(t.userId, t.createdAt),
  }),
);

export type LlmCallLog = typeof llmCallLogs.$inferSelect;
export type NewLlmCallLog = typeof llmCallLogs.$inferInsert;
