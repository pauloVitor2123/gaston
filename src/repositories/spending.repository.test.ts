import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import type { NewTransaction } from "@/db/schema";
import { CategoryRepository } from "./category.repository";
import { PlatformRepository } from "./platform.repository";
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
  const combustivel = await new CategoryRepository(db).create({
    userId: user.id,
    name: "Combustível",
    synonyms: [],
    parentId: transporte.id,
  });
  const base: Omit<NewTransaction, "description" | "accrualDate" | "dueDate"> = {
    userId: user.id,
    direction: "out",
    expectedAmountCents: 1000,
    paymentMethod: "cash",
    categoryId: alimentacao.id,
  };
  return {
    txRepo: new TransactionRepository(db),
    repo: new SpendingRepository(db),
    userId: user.id,
    transporteId: transporte.id,
    combustivelId: combustivel.id,
    base,
  };
}

describe("SpendingRepository", () => {
  it("sumByCategoryTree groups by category and subcategory, using actual over expected", async () => {
    const { txRepo, repo, userId, transporteId, combustivelId, base } = await setup(5001);
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
    await txRepo.create({
      ...base,
      description: "gasolina",
      categoryId: transporteId,
      subcategoryId: combustivelId,
      expectedAmountCents: 20000,
      accrualDate: inRange,
      dueDate: inRange,
    });
    await txRepo.create({ ...base, description: "fora", expectedAmountCents: 99900, accrualDate: new Date("2026-09-02"), dueDate: new Date("2026-09-02") });
    await txRepo.create({ ...base, description: "cancelado", status: "cancelled", expectedAmountCents: 5000, accrualDate: inRange, dueDate: inRange });
    await txRepo.create({ ...base, description: "recebimento", direction: "in", expectedAmountCents: 70000, accrualDate: inRange, dueDate: inRange });

    const rows = await repo.sumByCategoryTree({ userId, ...AUG });

    const key = (c: string | null, s: string | null) => `${c}/${s}`;
    const byKey = Object.fromEntries(rows.map((r) => [key(r.categoryLabel, r.subcategoryLabel), r.amountCents]));
    expect(byKey[key("Alimentação", null)]).toBe(45000);
    expect(byKey[key("Transporte", null)]).toBe(32000);
    expect(byKey[key("Transporte", "Combustível")]).toBe(20000);
    expect(rows).toHaveLength(3);
  });

  it("sumTotal returns the summed amount for the range", async () => {
    const { txRepo, repo, userId, base } = await setup(5002);
    const d = new Date("2026-08-05");
    await txRepo.create({ ...base, description: "a", expectedAmountCents: 1000, accrualDate: d, dueDate: d });
    await txRepo.create({ ...base, description: "b", expectedAmountCents: 2500, accrualDate: d, dueDate: d });

    expect(await repo.sumTotal({ userId, ...AUG })).toBe(3500);
  });

  it("sums income by platform and in total, ignoring expenses and undone income", async () => {
    const { txRepo, repo, userId, base } = await setup(5004);
    const db = drizzle(env.DB);
    const uber = await new PlatformRepository(db).create({ userId, name: "Uber", synonyms: [] });
    const d = new Date("2026-08-05");
    const income = { ...base, direction: "in" as const, categoryId: null, accrualDate: d, dueDate: d };
    await txRepo.create({ ...income, description: "Uber", platformId: uber.id, expectedAmountCents: 28000 });
    await txRepo.create({ ...income, description: "Uber", platformId: uber.id, expectedAmountCents: 12000 });
    await txRepo.create({ ...income, description: "receita", expectedAmountCents: 30000 });
    await txRepo.create({ ...income, description: "Uber", platformId: uber.id, status: "cancelled", expectedAmountCents: 99900 });
    await txRepo.create({ ...base, description: "gnv", expectedAmountCents: 9000, accrualDate: d, dueDate: d });

    const rows = await repo.sumIncomeByPlatform({ userId, ...AUG });
    const byLabel = Object.fromEntries(rows.map((r) => [String(r.label), r.amountCents]));
    expect(byLabel).toEqual({ Uber: 40000, null: 30000 });
    expect(await repo.sumIncomeTotal({ userId, ...AUG })).toBe(70000);
    expect(await repo.sumTotal({ userId, ...AUG })).toBe(9000);
  });

  it("sumByDay splits income and expenses per day, ignoring undone records", async () => {
    const { txRepo, repo, userId, base } = await setup(5006);
    const d1 = new Date("2026-08-05");
    const d2 = new Date("2026-08-06");
    await txRepo.create({ ...base, description: "gnv", expectedAmountCents: 9000, accrualDate: d1, dueDate: d1 });
    await txRepo.create({ ...base, description: "Uber", direction: "in", expectedAmountCents: 28000, accrualDate: d1, dueDate: d1 });
    await txRepo.create({ ...base, description: "99", direction: "in", expectedAmountCents: 30000, accrualDate: d2, dueDate: d2 });
    await txRepo.create({ ...base, description: "x", status: "cancelled", expectedAmountCents: 77700, accrualDate: d2, dueDate: d2 });

    const rows = await repo.sumByDay({ userId, ...AUG });
    const byDay = Object.fromEntries(rows.map((r) => [r.date.toISOString().slice(0, 10), [r.incomeCents, r.expenseCents]]));

    expect(byDay).toEqual({ "2026-08-05": [28000, 9000], "2026-08-06": [30000, 0] });
  });

  it("sumIncomeByDayAndPlatform splits each day's income by platform", async () => {
    const { txRepo, repo, userId, base } = await setup(5007);
    const uber = await new PlatformRepository(drizzle(env.DB)).create({ userId, name: "Uber", synonyms: [] });
    const d1 = new Date("2026-08-05");
    const d2 = new Date("2026-08-06");
    const income = { ...base, direction: "in" as const, categoryId: null };
    await txRepo.create({ ...income, description: "Uber", platformId: uber.id, expectedAmountCents: 20000, accrualDate: d1, dueDate: d1 });
    await txRepo.create({ ...income, description: "Uber", platformId: uber.id, expectedAmountCents: 8000, accrualDate: d1, dueDate: d1 });
    await txRepo.create({ ...income, description: "receita", expectedAmountCents: 30000, accrualDate: d2, dueDate: d2 });
    await txRepo.create({ ...base, description: "gnv", expectedAmountCents: 9000, accrualDate: d1, dueDate: d1 });

    const rows = await repo.sumIncomeByDayAndPlatform({ userId, ...AUG });
    const byKey = Object.fromEntries(rows.map((r) => [`${r.date.toISOString().slice(0, 10)}/${r.label}`, r.amountCents]));

    expect(byKey).toEqual({ "2026-08-05/Uber": 28000, "2026-08-06/null": 30000 });
  });

  it("sumTotal returns 0 when nothing matches the range", async () => {
    const { repo, userId } = await setup(5003);
    expect(await repo.sumTotal({ userId, ...AUG })).toBe(0);
  });
});
