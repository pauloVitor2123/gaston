import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import type { NewTransaction } from "@/db/schema";
import { BalanceRepository } from "./balance.repository";
import { TransactionRepository } from "./transaction.repository";
import { UserRepository } from "./user.repository";

const SINCE = new Date("2026-08-01T00:00:00Z");
const MONTH_END = new Date(Date.UTC(2026, 8, 1));

async function setup(chatId: number) {
  const db = drizzle(env.DB);
  const user = await new UserRepository(db).create({ telegramChatId: chatId, name: "T" });
  const base: Omit<NewTransaction, "description" | "accrualDate" | "dueDate"> = {
    userId: user.id,
    direction: "out",
    expectedAmountCents: 1000,
    paymentMethod: "pix",
  };
  return { txRepo: new TransactionRepository(db), repo: new BalanceRepository(db), userId: user.id, base };
}

describe("BalanceRepository", () => {
  it("sumSettledSince counts only settled rows of the direction settled after 'since'", async () => {
    const { txRepo, repo, userId, base } = await setup(6001);
    const d = new Date("2026-08-05");

    await txRepo.create({ ...base, direction: "in", description: "salário", status: "settled", settledAt: new Date("2026-08-10"), actualAmountCents: 300000, expectedAmountCents: 300000, accrualDate: d, dueDate: d });
    await txRepo.create({ ...base, direction: "out", description: "mercado", status: "settled", settledAt: new Date("2026-08-11"), actualAmountCents: 12000, expectedAmountCents: 12000, accrualDate: d, dueDate: d });
    await txRepo.create({ ...base, direction: "in", description: "antigo", status: "settled", settledAt: new Date("2026-07-20"), actualAmountCents: 999999, expectedAmountCents: 999999, accrualDate: d, dueDate: d });
    await txRepo.create({ ...base, direction: "out", description: "pendente", status: "pending", expectedAmountCents: 5000, accrualDate: d, dueDate: d });

    expect(await repo.sumSettledSince(userId, "in", SINCE)).toBe(300000);
    expect(await repo.sumSettledSince(userId, "out", SINCE)).toBe(12000);
  });

  it("sumSettledSince includes a row settled exactly at 'since' (inclusive lower bound)", async () => {
    const { txRepo, repo, userId, base } = await setup(6004);
    const d = new Date("2026-08-05");
    await txRepo.create({ ...base, direction: "in", description: "no limite", status: "settled", settledAt: SINCE, actualAmountCents: 5000, expectedAmountCents: 5000, accrualDate: d, dueDate: d });

    expect(await repo.sumSettledSince(userId, "in", SINCE)).toBe(5000);
  });

  it("sumPendingUntil counts only pending rows of the direction due before 'until'", async () => {
    const { txRepo, repo, userId, base } = await setup(6002);

    await txRepo.create({ ...base, direction: "in", description: "a receber", status: "pending", expectedAmountCents: 200000, accrualDate: new Date("2026-08-20"), dueDate: new Date("2026-08-20") });
    await txRepo.create({ ...base, direction: "in", description: "mês que vem", status: "pending", expectedAmountCents: 777777, accrualDate: new Date("2026-09-05"), dueDate: new Date("2026-09-05") });
    await txRepo.create({ ...base, direction: "in", description: "já caiu", status: "settled", settledAt: new Date("2026-08-02"), expectedAmountCents: 111, accrualDate: new Date("2026-08-02"), dueDate: new Date("2026-08-02") });

    expect(await repo.sumPendingUntil(userId, "in", MONTH_END)).toBe(200000);
  });

  it("returns 0 when nothing matches", async () => {
    const { repo, userId } = await setup(6003);
    expect(await repo.sumSettledSince(userId, "in", SINCE)).toBe(0);
    expect(await repo.sumPendingUntil(userId, "out", MONTH_END)).toBe(0);
  });
});
