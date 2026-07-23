import type { DrizzleD1Database } from "drizzle-orm/d1";
import { installmentPurchases, type InstallmentPurchase, type NewInstallmentPurchase } from "@/db/schema";
import type { IInstallmentPurchaseRepository } from "@/types/repository";

export class InstallmentPurchaseRepository implements IInstallmentPurchaseRepository {
  constructor(private readonly db: DrizzleD1Database) {}

  async create(data: NewInstallmentPurchase): Promise<InstallmentPurchase> {
    const [row] = await this.db.insert(installmentPurchases).values(data).returning();
    if (!row) throw new Error("Failed to create installment purchase");
    return row;
  }
}
