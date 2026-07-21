import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { CardRepository } from "./card.repository";
import { UserRepository } from "./user.repository";

async function setupUserWithCards(chatId: number) {
  const db = drizzle(env.DB);
  const user = await new UserRepository(db).create({ telegramChatId: chatId, name: "T" });
  const cards = new CardRepository(db);
  await cards.create({
    userId: user.id,
    name: "Nubank PF",
    aliases: ["nubank", "nu", "roxinho"],
    closingDay: 13,
    dueDay: 20,
  });
  await cards.create({ userId: user.id, name: "Itaú", aliases: ["itau"], closingDay: 1, dueDay: 10 });
  return { cards, userId: user.id };
}

describe("CardRepository", () => {
  it("create + listByUser retorna os cartões do usuário", async () => {
    const { cards, userId } = await setupUserWithCards(1001);
    const list = await cards.listByUser(userId);
    expect(list).toHaveLength(2);
    expect(list.map((c) => c.name).sort()).toEqual(["Itaú", "Nubank PF"]);
  });

  it("findByNameOrAlias acha por nome (case-insensitive)", async () => {
    const { cards, userId } = await setupUserWithCards(1002);
    const card = await cards.findByNameOrAlias(userId, "nubank pf");
    expect(card?.name).toBe("Nubank PF");
  });

  it("findByNameOrAlias acha por alias", async () => {
    const { cards, userId } = await setupUserWithCards(1003);
    const card = await cards.findByNameOrAlias(userId, "roxinho");
    expect(card?.name).toBe("Nubank PF");
  });

  it("findByNameOrAlias retorna null quando não acha", async () => {
    const { cards, userId } = await setupUserWithCards(1004);
    expect(await cards.findByNameOrAlias(userId, "inexistente")).toBeNull();
  });
});
