import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const pendingConversations = sqliteTable("pending_conversations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  stateJson: text("state_json", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});

export type PendingConversation = typeof pendingConversations.$inferSelect;
export type NewPendingConversation = typeof pendingConversations.$inferInsert;
