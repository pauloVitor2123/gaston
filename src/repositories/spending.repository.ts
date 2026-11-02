import { and, eq, gte, lt, ne, sql, type SQL } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { alias } from "drizzle-orm/sqlite-core";
import { categories, transactions } from "@/db/schema";
import type {
  CategorySubSpendingRow,
  ISpendingRepository,
  SpendingFilter,
} from "@/types/repository";

const subcategoriesTable = alias(categories, "subcategories");

export class SpendingRepository implements ISpendingRepository {
  constructor(private readonly db: DrizzleD1Database) {}

  async sumTotal(filter: SpendingFilter): Promise<number> {
    const [row] = await this.db
      .select({ amountCents: amount() })
      .from(transactions)
      .where(scope(filter));
    return row?.amountCents ?? 0;
  }

  async sumByCategoryTree(filter: SpendingFilter): Promise<CategorySubSpendingRow[]> {
    const rows = await this.db
      .select({
        categoryLabel: categories.name,
        subcategoryLabel: subcategoriesTable.name,
        amountCents: amount(),
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .leftJoin(subcategoriesTable, eq(transactions.subcategoryId, subcategoriesTable.id))
      .where(scope(filter))
      .groupBy(categories.id, subcategoriesTable.id);
    return rows.map((r) => ({
      categoryLabel: r.categoryLabel,
      subcategoryLabel: r.subcategoryLabel,
      amountCents: r.amountCents,
    }));
  }
}

function amount(): SQL<number> {
  return sql<number>`sum(coalesce(${transactions.actualAmountCents}, ${transactions.expectedAmountCents}))`;
}

function scope(filter: SpendingFilter): SQL | undefined {
  return and(
    eq(transactions.userId, filter.userId),
    ne(transactions.status, "cancelled"),
    eq(transactions.direction, "out"),
    gte(transactions.dueDate, filter.from),
    lt(transactions.dueDate, filter.to),
  );
}
