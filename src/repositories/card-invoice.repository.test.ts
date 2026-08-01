import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { CardInvoiceRepository } from "./card-invoice.repository";
import { CardRepository } from "./card.repository";
import { UserRepository } from "./user.repository";

async function setup(chatId: number) {
  const db = drizzle(env.DB);
  const user = await new UserRepository(db).create({ telegramChatId: chatId, name: "T" });
  const card = await new CardRepository(db).create({
    userId: user.id,
    name: "Nubank",
    aliases: [],
    closingDay: 13,
    dueDay: 20,
  });
  return { repo: new CardInvoiceRepository(db), userId: user.id, cardId: card.id };
}

describe("CardInvoiceRepository", () => {
  it("findOrCreate creates a new invoice when none exists", async () => {
    const { repo, userId, cardId } = await setup(5001);
    const cycleStart = new Date("2025-01-01");
    const cycleEnd = new Date("2025-01-13");
    const dueDate = new Date("2025-01-20");

    const invoice = await repo.findOrCreate(userId, cardId, cycleStart, cycleEnd, dueDate);
    expect(invoice.status).toBe("open");
    expect(invoice.cardId).toBe(cardId);
  });

  it("findOrCreate returns existing invoice on second call", async () => {
    const { repo, userId, cardId } = await setup(5002);
    const cycleStart = new Date("2025-02-01");
    const cycleEnd = new Date("2025-02-13");
    const dueDate = new Date("2025-02-20");

    const first = await repo.findOrCreate(userId, cardId, cycleStart, cycleEnd, dueDate);
    const second = await repo.findOrCreate(userId, cardId, cycleStart, cycleEnd, dueDate);
    expect(second.id).toBe(first.id);
  });

  it("listOpen returns only open invoices", async () => {
    const { repo, userId, cardId } = await setup(5003);
    await repo.findOrCreate(
      userId,
      cardId,
      new Date("2025-03-01"),
      new Date("2025-03-13"),
      new Date("2025-03-20"),
    );

    const open = await repo.listOpen(userId);
    expect(open).toHaveLength(1);
    expect(open[0]?.status).toBe("open");
  });

  it("update flips status/paidAmount and findById scopes by user", async () => {
    const { repo, userId, cardId } = await setup(5004);
    const invoice = await repo.findOrCreate(
      userId,
      cardId,
      new Date("2025-04-01"),
      new Date("2025-04-13"),
      new Date("2025-04-20"),
    );

    await repo.update(userId, invoice.id, { status: "paid", paidAmountCents: 5000, paidAt: new Date() });

    const found = await repo.findById(userId, invoice.id);
    expect(found?.status).toBe("paid");
    expect(found?.paidAmountCents).toBe(5000);
    expect(await repo.findById(userId + 999, invoice.id)).toBeNull();
    expect(await repo.listOpen(userId)).toHaveLength(0);
  });
});
