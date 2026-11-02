import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import type { NewTransaction } from "@/db/schema";
import { CategoryRepository } from "./category.repository";
import { MantraRepository } from "./mantra.repository";
import { TransactionRepository } from "./transaction.repository";
import { UserRepository } from "./user.repository";

async function setup(chatId: number) {
  const db = drizzle(env.DB);
  const user = await new UserRepository(db).create({ telegramChatId: chatId, name: "T" });
  const category = await new CategoryRepository(db).create({
    userId: user.id,
    name: "Alimentação",
    synonyms: [],
  });
  const mantra = await new MantraRepository(db).create({
    userId: user.id,
    name: "Pagas as Contas",
    targetPercent: 45,
  });
  const base: Omit<NewTransaction, "description" | "accrualDate" | "dueDate"> = {
    userId: user.id,
    direction: "out",
    expectedAmountCents: 1000,
    paymentMethod: "cash",
    categoryId: category.id,
    mantraId: mantra.id,
  };
  return { repo: new TransactionRepository(db), userId: user.id, base };
}

describe("TransactionRepository", () => {
  it("create returns the created transaction", async () => {
    const { repo, base } = await setup(4001);
    const now = new Date();
    const tx = await repo.create({
      ...base,
      description: "almoço",
      status: "settled",
      accrualDate: now,
      dueDate: now,
    });

    expect(tx.description).toBe("almoço");
    expect(tx.status).toBe("settled");
    expect(tx.direction).toBe("out");
  });

  describe("cancelBatch", () => {
    async function seedBatch(chatId: number) {
      const ctx = await setup(chatId);
      const now = new Date();
      const row = { ...ctx.base, status: "settled" as const, accrualDate: now, dueDate: now };
      await ctx.repo.create({ ...row, description: "gnv", batchId: "b1" });
      await ctx.repo.create({ ...row, description: "uber", direction: "in", batchId: "b1" });
      const other = await ctx.repo.create({ ...row, description: "almoço", batchId: "b2" });
      return { ...ctx, other };
    }

    it("cancels every record of the batch and reports how many it touched", async () => {
      const { repo, userId } = await seedBatch(4002);

      expect(await repo.cancelBatch(userId, "b1")).toEqual({ total: 2, cancelled: 2 });
    });

    it("is idempotent: a second undo touches nothing but still finds the batch", async () => {
      const { repo, userId } = await seedBatch(4003);
      await repo.cancelBatch(userId, "b1");

      expect(await repo.cancelBatch(userId, "b1")).toEqual({ total: 2, cancelled: 0 });
    });

    it("leaves other batches untouched and ignores other users' batches", async () => {
      const { repo, userId } = await seedBatch(4004);

      expect(await repo.cancelBatch(userId + 999, "b1")).toEqual({ total: 0, cancelled: 0 });
      expect(await repo.cancelBatch(userId, "b2")).toEqual({ total: 1, cancelled: 1 });
      expect(await repo.cancelBatch(userId, "b1")).toEqual({ total: 2, cancelled: 2 });
    });
  });
});
