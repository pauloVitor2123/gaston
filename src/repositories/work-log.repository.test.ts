import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { parseUtcDate } from "@/services/dates";
import { UserRepository } from "./user.repository";
import { WorkLogRepository } from "./work-log.repository";

async function setup(chatId: number) {
  const db = drizzle(env.DB);
  const user = await new UserRepository(db).create({ telegramChatId: chatId, name: "T" });
  return { repo: new WorkLogRepository(db), userId: user.id };
}

describe("WorkLogRepository", () => {
  it("lists active logs whose period starts inside the range", async () => {
    const { repo, userId } = await setup(8001);
    await repo.create({ userId, period: "day", periodStart: parseUtcDate("2026-10-27"), km: 180.5, batchId: "a" });
    await repo.create({ userId, period: "week", periodStart: parseUtcDate("2026-10-26"), onlineMinutes: 2400, batchId: "b" });
    await repo.create({ userId, period: "day", periodStart: parseUtcDate("2026-11-02"), km: 99, batchId: "c" });
    await repo.create({ userId, period: "day", periodStart: parseUtcDate("2026-10-28"), km: 50, status: "cancelled", batchId: "d" });

    const logs = await repo.listActive(userId, parseUtcDate("2026-10-26"), parseUtcDate("2026-11-02"));

    expect(logs.map((l) => [l.period, l.km, l.onlineMinutes])).toEqual([
      ["day", 180.5, null],
      ["week", null, 2400],
    ]);
  });

  it("cancels a batch idempotently and reports what it touched", async () => {
    const { repo, userId } = await setup(8002);
    await repo.create({ userId, period: "day", periodStart: parseUtcDate("2026-10-27"), km: 10, batchId: "x" });

    expect(await repo.cancelBatch(userId, "x")).toEqual({ total: 1, cancelled: 1 });
    expect(await repo.cancelBatch(userId, "x")).toEqual({ total: 1, cancelled: 0 });
    expect(await repo.cancelBatch(userId, "missing")).toEqual({ total: 0, cancelled: 0 });
    expect(await repo.listActive(userId, parseUtcDate("2026-10-26"), parseUtcDate("2026-11-02"))).toEqual([]);
  });
});
