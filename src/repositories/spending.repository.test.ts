import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import type { NewTransaction } from "@/db/schema";
import { CategoryRepository } from "./category.repository";
import { MantraRepository } from "./mantra.repository";
import { SpendingRepository } from "./spending.repository";
import { TransactionRepository } from "./transaction.repository";
import { UserRepository } from "./user.repository";

const AUG = { from: new Date(Date.UTC(2026, 7, 1)), to: new Date(Date.UTC(2026, 8, 1)) };

async function setup(chatId: number) {
  const db = drizzle(env.DB);
  const user = await new UserRepository(db).create({ telegramChatId: chatId, name: "T" });
  const alimentacao = await new CategoryRepository(db).create({
    userId: user.id,
    name: "Alimentação",
    synonyms: [],
  });
  const transporte = await new CategoryRepository(db).create({
    userId: user.id,
    name: "Transporte",
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
    categoryId: alimentacao.id,
    mantraId: mantra.id,
  };
  return {
    txRepo: new TransactionRepository(db),
    repo: new SpendingRepository(db),
    userId: user.id,
    transporteId: transporte.id,
    base,
  };
}

describe("SpendingRepository", () => {
  it("sumByCategory groups over a due-date range, using actual over expected", async () => {
    const { txRepo, repo, userId, transporteId, base } = await setup(5001);
    const inRange = new Date("2026-08-05");
    const settled = new Date("2026-08-10");

    await txRepo.create({ ...base, description: "mercado", expectedAmountCents: 45000, accrualDate: inRange, dueDate: inRange });
    await txRepo.create({
      ...base,
      description: "uber",
      categoryId: transporteId,
      expectedAmountCents: 30000,
      actualAmountCents: 32000,
      status: "settled",
      accrualDate: settled,
      dueDate: settled,
    });
    await txRepo.create({ ...base, description: "fora", expectedAmountCents: 99900, accrualDate: new Date("2026-09-02"), dueDate: new Date("2026-09-02") });
    await txRepo.create({ ...base, description: "cancelado", status: "cancelled", expectedAmountCents: 5000, accrualDate: inRange, dueDate: inRange });
    await txRepo.create({ ...base, description: "recebimento", direction: "in", expectedAmountCents: 70000, accrualDate: inRange, dueDate: inRange });

    const rows = await repo.sumByCategory({ userId, ...AUG });

    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.amountCents]));
    expect(byLabel["Alimentação"]).toBe(45000);
    expect(byLabel["Transporte"]).toBe(32000);
    expect(rows).toHaveLength(2);
  });

  it("sumByMantra groups spending by mantra", async () => {
    const { txRepo, repo, userId, base } = await setup(5005);
    const d = new Date("2026-08-05");
    await txRepo.create({ ...base, description: "a", expectedAmountCents: 1000, accrualDate: d, dueDate: d });
    await txRepo.create({ ...base, description: "b", expectedAmountCents: 2500, accrualDate: d, dueDate: d });

    const rows = await repo.sumByMantra({ userId, ...AUG });
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.amountCents]));
    expect(byLabel["Pagas as Contas"]).toBe(3500);
  });

  it("sumTotal returns the summed amount for the range", async () => {
    const { txRepo, repo, userId, base } = await setup(5002);
    const d = new Date("2026-08-05");
    await txRepo.create({ ...base, description: "a", expectedAmountCents: 1000, accrualDate: d, dueDate: d });
    await txRepo.create({ ...base, description: "b", expectedAmountCents: 2500, accrualDate: d, dueDate: d });

    expect(await repo.sumTotal({ userId, ...AUG })).toBe(3500);
  });

  it("sumTotal returns 0 when nothing matches the range", async () => {
    const { repo, userId } = await setup(5003);
    expect(await repo.sumTotal({ userId, ...AUG })).toBe(0);
  });
});
