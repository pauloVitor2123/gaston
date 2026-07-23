import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { UserRepository } from "./user.repository";
import { MantraRepository } from "./mantra.repository";

async function setup(chatId: number) {
  const db = drizzle(env.DB);
  const user = await new UserRepository(db).create({ telegramChatId: chatId, name: "T" });
  return { repo: new MantraRepository(db), userId: user.id };
}

describe("MantraRepository", () => {
  it("create + listByUser returns the user's mantras", async () => {
    const { repo, userId } = await setup(3001);
    await repo.create({ userId, name: "Pagas as Contas", targetPercent: 45 });
    await repo.create({ userId, name: "Se Pagar", targetPercent: 30 });

    const list = await repo.listByUser(userId);
    expect(list).toHaveLength(2);
    expect(list.map((m) => m.name).sort()).toEqual(["Pagas as Contas", "Se Pagar"]);
  });

  it("findByName finds by name (case-insensitive)", async () => {
    const { repo, userId } = await setup(3002);
    await repo.create({ userId, name: "Doar", targetPercent: 10 });

    expect((await repo.findByName(userId, "doar"))?.name).toBe("Doar");
  });

  it("findByName returns null when not found", async () => {
    const { repo, userId } = await setup(3003);
    expect(await repo.findByName(userId, "Inexistente")).toBeNull();
  });
});
