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
});
