import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { UserRepository } from "./user.repository";

const makeRepo = () => new UserRepository(drizzle(env.DB));

describe("UserRepository", () => {
  it("create inserts and returns the user (with defaults)", async () => {
    const repo = makeRepo();
    const user = await repo.create({ telegramChatId: 12345, name: "Fulano" });

    expect(user.id).toBeGreaterThan(0);
    expect(user.telegramChatId).toBe(12345);
    expect(user.name).toBe("Fulano");
    expect(user.timezone).toBe("America/Sao_Paulo");
    expect(user.balanceCents).toBe(0);
  });

  it("setBalance updates the balance and its timestamp", async () => {
    const repo = makeRepo();
    const user = await repo.create({ telegramChatId: 54321, name: "Ciclano" });
    const at = new Date("2026-08-04T12:00:00Z");

    await repo.setBalance(user.id, 500000, at);

    const updated = await repo.findByChatId(54321);
    expect(updated?.balanceCents).toBe(500000);
    expect(updated?.balanceSetAt).toEqual(at);
  });

  it("findByChatId returns existing user", async () => {
    const repo = makeRepo();
    await repo.create({ telegramChatId: 999, name: "Beltrano" });

    const found = await repo.findByChatId(999);
    expect(found?.name).toBe("Beltrano");
  });

  it("findByChatId returns null when not found", async () => {
    const repo = makeRepo();
    expect(await repo.findByChatId(424242)).toBeNull();
  });
});
