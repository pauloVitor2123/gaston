import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { CardRepository } from "./card.repository";
import { CategoryRepository } from "./category.repository";
import { InstallmentPurchaseRepository } from "./installment-purchase.repository";
import { MantraRepository } from "./mantra.repository";
import { UserRepository } from "./user.repository";

describe("InstallmentPurchaseRepository", () => {
  it("create returns the created installment purchase", async () => {
    const db = drizzle(env.DB);
    const user = await new UserRepository(db).create({ telegramChatId: 6001, name: "T" });
    const card = await new CardRepository(db).create({
      userId: user.id,
      name: "Nubank",
      aliases: [],
      closingDay: 13,
      dueDay: 20,
    });
    const category = await new CategoryRepository(db).create({
      userId: user.id,
      name: "Eletrodomésticos",
      synonyms: [],
    });
    const mantra = await new MantraRepository(db).create({
      userId: user.id,
      name: "Pagas as Contas",
      targetPercent: 45,
    });

    const repo = new InstallmentPurchaseRepository(db);
    const purchase = await repo.create({
      userId: user.id,
      description: "Máquina de lavar",
      totalAmountCents: 366800,
      installmentsCount: 5,
      purchaseDate: new Date("2025-01-15"),
      paymentMethod: "card",
      cardId: card.id,
      categoryId: category.id,
      mantraId: mantra.id,
    });

    expect(purchase.description).toBe("Máquina de lavar");
    expect(purchase.installmentsCount).toBe(5);
    expect(purchase.direction).toBe("out");
  });
});
