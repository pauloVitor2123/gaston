import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { parseUtcDate } from "@/services/dates";
import { UserRepository } from "@/repositories/user.repository";
import { WeeklyInsightRepository } from "@/repositories/weekly-insight.repository";

const MONDAY = parseUtcDate("2026-10-26");
const ITEM = { hypothesis: "h", suggestion: "s" };

async function setup(chatId: number) {
  const db = drizzle(env.DB);
  const user = await new UserRepository(db).create({ telegramChatId: chatId, name: "T" });
  return { repo: new WeeklyInsightRepository(db), userId: user.id };
}

describe("WeeklyInsightRepository", () => {
  it("returns null when the week has no insight", async () => {
    const { repo, userId } = await setup(7001);
    expect(await repo.findByWeek(userId, MONDAY)).toBeNull();
  });

  it("saves and then replaces the insight of a week", async () => {
    const { repo, userId } = await setup(7002);

    await repo.save({ userId, weekStart: MONDAY, fingerprint: "a", content: [ITEM] });
    await repo.save({ userId, weekStart: MONDAY, fingerprint: "b", content: [ITEM, ITEM] });

    const found = await repo.findByWeek(userId, MONDAY);
    expect(found?.fingerprint).toBe("b");
    expect(found?.content).toHaveLength(2);
    expect(await repo.findByWeek(userId, parseUtcDate("2026-11-02"))).toBeNull();
  });
});
