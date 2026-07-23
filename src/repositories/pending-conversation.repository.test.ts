import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { PendingConversationRepository } from "./pending-conversation.repository";
import { UserRepository } from "./user.repository";

async function setup(chatId: number) {
  const db = drizzle(env.DB);
  const user = await new UserRepository(db).create({ telegramChatId: chatId, name: "T" });
  return { repo: new PendingConversationRepository(db), userId: user.id };
}

const future = () => new Date(Date.now() + 10 * 60 * 1000);
const past = () => new Date(Date.now() - 1000);

describe("PendingConversationRepository", () => {
  it("findActiveByUser returns active (non-expired) conversation", async () => {
    const { repo, userId } = await setup(8001);
    await repo.create({ userId, stateJson: { step: 1 }, expiresAt: future() });

    const found = await repo.findActiveByUser(userId);
    expect(found).not.toBeNull();
    expect((found?.stateJson as { step: number }).step).toBe(1);
  });

  it("findActiveByUser returns null for expired conversation", async () => {
    const { repo, userId } = await setup(8002);
    await repo.create({ userId, stateJson: { step: 1 }, expiresAt: past() });

    expect(await repo.findActiveByUser(userId)).toBeNull();
  });

  it("update changes stateJson", async () => {
    const { repo, userId } = await setup(8003);
    const conv = await repo.create({ userId, stateJson: { step: 1 }, expiresAt: future() });

    const updated = await repo.update(conv.id, { step: 2, value: 100 });
    expect((updated.stateJson as { step: number }).step).toBe(2);
  });

  it("delete removes the conversation", async () => {
    const { repo, userId } = await setup(8004);
    const conv = await repo.create({ userId, stateJson: { step: 1 }, expiresAt: future() });

    await repo.delete(conv.id);
    expect(await repo.findActiveByUser(userId)).toBeNull();
  });
});
