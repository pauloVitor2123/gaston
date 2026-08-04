import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import type { NewTransaction } from "@/db/schema";
import { CardRepository } from "./card.repository";
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
  const card = await new CardRepository(db).create({
    userId: user.id,
    name: "Nubank",
    aliases: [],
    closingDay: 13,
    dueDay: 20,
  });
  const base: Omit<NewTransaction, "description" | "accrualDate" | "dueDate"> = {
    userId: user.id,
    direction: "out",
    expectedAmountCents: 1000,
    paymentMethod: "pix",
    categoryId: category.id,
    mantraId: mantra.id,
  };
  return {
    repo: new TransactionRepository(db),
    db,
    userId: user.id,
    cardId: card.id,
    categoryId: category.id,
    base,
  };
}

describe("TransactionRepository", () => {
  it("create returns the created transaction", async () => {
    const { repo, base } = await setup(4001);
    const now = new Date();
    const tx = await repo.create({ ...base, description: "almoço", accrualDate: now, dueDate: now });

    expect(tx.description).toBe("almoço");
    expect(tx.status).toBe("pending");
    expect(tx.direction).toBe("out");
  });

  it("findLastByUser returns transactions sorted by accrual date desc", async () => {
    const { repo, base, userId } = await setup(4002);
    const d1 = new Date("2025-01-10");
    const d2 = new Date("2025-01-20");
    await repo.create({ ...base, description: "anterior", accrualDate: d1, dueDate: d1 });
    await repo.create({ ...base, description: "recente", accrualDate: d2, dueDate: d2 });

    const list = await repo.findLastByUser(userId, 10);
    expect(list[0]?.description).toBe("recente");
    expect(list[1]?.description).toBe("anterior");
  });

  it("findLastByUser respects limit", async () => {
    const { repo, base, userId } = await setup(4003);
    const d = new Date();
    await repo.create({ ...base, description: "a", accrualDate: d, dueDate: d });
    await repo.create({ ...base, description: "b", accrualDate: d, dueDate: d });
    await repo.create({ ...base, description: "c", accrualDate: d, dueDate: d });

    expect(await repo.findLastByUser(userId, 2)).toHaveLength(2);
  });

  it("findById returns the transaction when it belongs to user", async () => {
    const { repo, base } = await setup(4004);
    const d = new Date();
    const tx = await repo.create({ ...base, description: "test", accrualDate: d, dueDate: d });

    expect((await repo.findById(base.userId, tx.id))?.id).toBe(tx.id);
  });

  it("findById returns null for wrong user", async () => {
    const { repo, base } = await setup(4005);
    const d = new Date();
    const tx = await repo.create({ ...base, description: "test", accrualDate: d, dueDate: d });

    expect(await repo.findById(base.userId + 999, tx.id)).toBeNull();
  });

  it("listPayable returns only pending non-card transactions", async () => {
    const { repo, base, userId } = await setup(4006);
    const d = new Date();
    await repo.create({ ...base, description: "pix pendente", accrualDate: d, dueDate: d });
    await repo.create({ ...base, description: "cartão", paymentMethod: "card", accrualDate: d, dueDate: d });
    await repo.create({ ...base, description: "já pago", status: "settled", accrualDate: d, dueDate: d });

    const payable = await repo.listPayable(userId);
    expect(payable).toHaveLength(1);
    expect(payable[0]?.description).toBe("pix pendente");
  });

  it("update patches settlement fields for the owning user", async () => {
    const { repo, base, userId } = await setup(4007);
    const d = new Date();
    const tx = await repo.create({ ...base, description: "conta", accrualDate: d, dueDate: d });

    await repo.update(userId, tx.id, { status: "settled", actualAmountCents: 1234, settledAt: d });

    const updated = await repo.findById(userId, tx.id);
    expect(updated?.status).toBe("settled");
    expect(updated?.actualAmountCents).toBe(1234);
  });

  it("sumByDimension groups by category over a due-date range, using actual over expected", async () => {
    const { repo, db, base, userId } = await setup(4008);
    const transporte = await new CategoryRepository(db).create({
      userId,
      name: "Transporte",
      synonyms: [],
    });
    const inRange = new Date("2026-08-05");
    const settled = new Date("2026-08-10");

    await repo.create({
      ...base,
      description: "mercado",
      expectedAmountCents: 45000,
      accrualDate: inRange,
      dueDate: inRange,
    });
    await repo.create({
      ...base,
      description: "uber",
      categoryId: transporte.id,
      expectedAmountCents: 30000,
      actualAmountCents: 32000,
      status: "settled",
      accrualDate: settled,
      dueDate: settled,
    });
    await repo.create({
      ...base,
      description: "fora do intervalo",
      expectedAmountCents: 99900,
      accrualDate: new Date("2026-09-02"),
      dueDate: new Date("2026-09-02"),
    });
    await repo.create({
      ...base,
      description: "cancelado",
      status: "cancelled",
      expectedAmountCents: 5000,
      accrualDate: inRange,
      dueDate: inRange,
    });
    await repo.create({
      ...base,
      description: "recebimento",
      direction: "in",
      expectedAmountCents: 70000,
      accrualDate: inRange,
      dueDate: inRange,
    });

    const rows = await repo.sumByDimension({
      userId,
      groupBy: "category",
      from: new Date(Date.UTC(2026, 7, 1)),
      to: new Date(Date.UTC(2026, 8, 1)),
      direction: "out",
    });

    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.amountCents]));
    expect(byLabel["Alimentação"]).toBe(45000);
    expect(byLabel["Transporte"]).toBe(32000);
    expect(rows).toHaveLength(2);
  });

  it("sumByDimension with groupBy 'none' returns a single total row", async () => {
    const { repo, base, userId } = await setup(4009);
    const d = new Date("2026-08-05");
    await repo.create({ ...base, description: "a", expectedAmountCents: 1000, accrualDate: d, dueDate: d });
    await repo.create({ ...base, description: "b", expectedAmountCents: 2500, accrualDate: d, dueDate: d });

    const rows = await repo.sumByDimension({
      userId,
      groupBy: "none",
      from: new Date(Date.UTC(2026, 7, 1)),
      to: new Date(Date.UTC(2026, 8, 1)),
      direction: "out",
    });

    expect(rows).toEqual([{ label: null, amountCents: 3500 }]);
  });
});
