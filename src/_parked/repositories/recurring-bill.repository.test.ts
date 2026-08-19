import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { CategoryRepository } from "./category.repository";
import { MantraRepository } from "./mantra.repository";
import { RecurringBillRepository } from "./recurring-bill.repository";
import { UserRepository } from "./user.repository";

async function setup(chatId: number) {
  const db = drizzle(env.DB);
  const user = await new UserRepository(db).create({ telegramChatId: chatId, name: "T" });
  const category = await new CategoryRepository(db).create({
    userId: user.id,
    name: "Moradia",
    synonyms: [],
  });
  const mantra = await new MantraRepository(db).create({
    userId: user.id,
    name: "Pagas as Contas",
    targetPercent: 45,
  });
  return {
    repo: new RecurringBillRepository(db),
    userId: user.id,
    categoryId: category.id,
    mantraId: mantra.id,
  };
}

describe("RecurringBillRepository", () => {
  it("create returns the created recurring bill", async () => {
    const { repo, userId, categoryId, mantraId } = await setup(7001);
    const bill = await repo.create({
      userId,
      description: "Aluguel",
      kind: "fixed",
      expectedAmountCents: 200000,
      dueDay: 10,
      paymentMethod: "pix",
      categoryId,
      mantraId,
    });

    expect(bill.description).toBe("Aluguel");
    expect(bill.isActive).toBe(true);
  });

  it("listActive returns only active bills", async () => {
    const { repo, userId, categoryId, mantraId } = await setup(7002);
    await repo.create({
      userId,
      description: "Aluguel",
      kind: "fixed",
      expectedAmountCents: 200000,
      dueDay: 10,
      paymentMethod: "pix",
      categoryId,
      mantraId,
    });
    const inactive = await repo.create({
      userId,
      description: "Streaming cancelado",
      kind: "subscription",
      expectedAmountCents: 3990,
      dueDay: 15,
      paymentMethod: "card",
      categoryId,
      mantraId,
      isActive: false,
    });

    const active = await repo.listActive(userId);
    expect(active).toHaveLength(1);
    expect(active.find((b) => b.id === inactive.id)).toBeUndefined();
  });

  it("findById returns the bill scoped to the user", async () => {
    const { repo, userId, categoryId, mantraId } = await setup(7003);
    const bill = await repo.create({
      userId,
      description: "Internet",
      kind: "fixed",
      expectedAmountCents: 29900,
      dueDay: 15,
      paymentMethod: "pix",
      categoryId,
      mantraId,
    });

    expect(await repo.findById(userId, bill.id)).toMatchObject({ id: bill.id, description: "Internet" });
    expect(await repo.findById(userId + 999, bill.id)).toBeNull();
  });

  it("deactivate flips isActive to false", async () => {
    const { repo, userId, categoryId, mantraId } = await setup(7004);
    const bill = await repo.create({
      userId,
      description: "Academia",
      kind: "subscription",
      expectedAmountCents: 9900,
      dueDay: 5,
      paymentMethod: "debit",
      categoryId,
      mantraId,
    });

    await repo.deactivate(userId, bill.id);

    expect(await repo.findById(userId, bill.id)).toMatchObject({ isActive: false });
    expect(await repo.listActive(userId)).toHaveLength(0);
  });
});
