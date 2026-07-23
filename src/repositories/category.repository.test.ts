import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { UserRepository } from "./user.repository";
import { CategoryRepository } from "./category.repository";

async function setup(chatId: number) {
  const db = drizzle(env.DB);
  const user = await new UserRepository(db).create({ telegramChatId: chatId, name: "T" });
  return { repo: new CategoryRepository(db), userId: user.id };
}

describe("CategoryRepository", () => {
  it("create + listByUser returns the user's categories", async () => {
    const { repo, userId } = await setup(2001);
    await repo.create({ userId, name: "Alimentação", synonyms: ["comida", "restaurante"] });
    await repo.create({ userId, name: "Transporte", synonyms: [] });

    const list = await repo.listByUser(userId);
    expect(list).toHaveLength(2);
    expect(list.map((c) => c.name).sort()).toEqual(["Alimentação", "Transporte"]);
  });

  it("findByNameOrSynonym finds by name (case-insensitive)", async () => {
    const { repo, userId } = await setup(2002);
    await repo.create({ userId, name: "Saúde", synonyms: [] });

    const found = await repo.findByNameOrSynonym(userId, "saúde");
    expect(found?.name).toBe("Saúde");
  });

  it("findByNameOrSynonym finds by synonym", async () => {
    const { repo, userId } = await setup(2003);
    await repo.create({ userId, name: "Alimentação", synonyms: ["comida", "restaurante"] });

    expect((await repo.findByNameOrSynonym(userId, "Restaurante"))?.name).toBe("Alimentação");
  });

  it("findByNameOrSynonym returns null when not found", async () => {
    const { repo, userId } = await setup(2004);
    expect(await repo.findByNameOrSynonym(userId, "inexistente")).toBeNull();
  });
});
