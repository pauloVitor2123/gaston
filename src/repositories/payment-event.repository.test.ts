import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { PaymentEventRepository } from "./payment-event.repository";
import { UserRepository } from "./user.repository";

async function setup(chatId: number) {
  const db = drizzle(env.DB);
  const user = await new UserRepository(db).create({ telegramChatId: chatId, name: "T" });
  return { repo: new PaymentEventRepository(db), userId: user.id };
}

describe("PaymentEventRepository", () => {
  it("create then findById returns the event scoped to the user", async () => {
    const { repo, userId } = await setup(9001);
    const created = await repo.create({
      userId,
      targetType: "transaction",
      targetId: 42,
      description: "conta de luz",
      amountCents: 1800,
      paidAt: new Date(),
    });

    const found = await repo.findById(userId, created.id);
    expect(found?.amountCents).toBe(1800);
    expect(found?.description).toBe("conta de luz");
    expect(found?.targetType).toBe("transaction");
    expect(await repo.findById(userId + 999, created.id)).toBeNull();
  });

  it("listByTarget returns only active events for that target", async () => {
    const { repo, userId } = await setup(9002);
    await repo.create({ userId, targetType: "invoice", targetId: 7, description: "Fatura", amountCents: 1000, paidAt: new Date() });
    await repo.create({ userId, targetType: "invoice", targetId: 7, description: "Fatura", amountCents: 500, paidAt: new Date() });
    await repo.create({ userId, targetType: "invoice", targetId: 8, description: "Fatura", amountCents: 300, paidAt: new Date() });

    const events = await repo.listByTarget(userId, "invoice", 7);
    expect(events).toHaveLength(2);
    expect(events.reduce((sum, e) => sum + e.amountCents, 0)).toBe(1500);
  });

  it("void hides the event from listByTarget and listRecentByUser", async () => {
    const { repo, userId } = await setup(9003);
    const event = await repo.create({
      userId,
      targetType: "invoice",
      targetId: 5,
      description: "Fatura",
      amountCents: 1000,
      paidAt: new Date(),
    });

    await repo.void(event.id);

    expect(await repo.listByTarget(userId, "invoice", 5)).toHaveLength(0);
    expect(await repo.listRecentByUser(userId, 10)).toHaveLength(0);
    expect((await repo.findById(userId, event.id))?.voidedAt).not.toBeNull();
  });

  it("listRecentByUser returns active events newest first, respecting the limit", async () => {
    const { repo, userId } = await setup(9004);
    const older = await repo.create({
      userId,
      targetType: "transaction",
      targetId: 1,
      description: "antigo",
      amountCents: 100,
      paidAt: new Date(Date.now() - 60_000),
    });
    const newer = await repo.create({
      userId,
      targetType: "transaction",
      targetId: 2,
      description: "recente",
      amountCents: 200,
      paidAt: new Date(),
    });

    const recent = await repo.listRecentByUser(userId, 1);
    expect(recent).toHaveLength(1);
    expect(recent[0]!.id).toBe(newer.id);
    expect(recent[0]!.id).not.toBe(older.id);
  });
});
