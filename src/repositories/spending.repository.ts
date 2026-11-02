import { and, eq, gte, lt, ne, sql, type SQL } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { alias } from "drizzle-orm/sqlite-core";
import { categories, platforms, transactions } from "@/db/schema";
import type {
  CategorySubSpendingRow,
  DailyMoneyRow,
  DailyPlatformIncomeRow,
  ISpendingRepository,
  LabeledAmountRow,
  SpendingFilter,
} from "@/types/repository";

const subcategoriesTable = alias(categories, "subcategories");

type Direction = "in" | "out";

export class SpendingRepository implements ISpendingRepository {
  constructor(private readonly db: DrizzleD1Database) {}

  async sumTotal(filter: SpendingFilter): Promise<number> {
    return this.total(filter, "out");
  }

  async sumIncomeTotal(filter: SpendingFilter): Promise<number> {
    return this.total(filter, "in");
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
      .where(scope(filter, "out"))
      .groupBy(categories.id, subcategoriesTable.id);
    return rows.map((r) => ({
      categoryLabel: r.categoryLabel,
      subcategoryLabel: r.subcategoryLabel,
      amountCents: r.amountCents,
    }));
  }

  async sumIncomeByPlatform(filter: SpendingFilter): Promise<LabeledAmountRow[]> {
    const rows = await this.db
      .select({ label: platforms.name, amountCents: amount() })
      .from(transactions)
      .leftJoin(platforms, eq(transactions.platformId, platforms.id))
      .where(scope(filter, "in"))
      .groupBy(platforms.id);
    return rows.map((r) => ({ label: r.label, amountCents: r.amountCents }));
  }

  async sumIncomeByDayAndPlatform(filter: SpendingFilter): Promise<DailyPlatformIncomeRow[]> {
    const rows = await this.db
      .select({ date: transactions.dueDate, label: platforms.name, amountCents: amount() })
      .from(transactions)
      .leftJoin(platforms, eq(transactions.platformId, platforms.id))
      .where(scope(filter, "in"))
      .groupBy(transactions.dueDate, platforms.id);
    return rows.map((r) => ({ date: r.date, label: r.label, amountCents: r.amountCents }));
  }

  async sumByDay(filter: SpendingFilter): Promise<DailyMoneyRow[]> {
    const rows = await this.db
      .select({
        date: transactions.dueDate,
        incomeCents: sql<number>`sum(case when ${transactions.direction} = 'in' then ${effectiveAmount} else 0 end)`,
        expenseCents: sql<number>`sum(case when ${transactions.direction} = 'out' then ${effectiveAmount} else 0 end)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, filter.userId),
          ne(transactions.status, "cancelled"),
          gte(transactions.dueDate, filter.from),
          lt(transactions.dueDate, filter.to),
        ),
      )
      .groupBy(transactions.dueDate);
    return rows.map((r) => ({ date: r.date, incomeCents: r.incomeCents, expenseCents: r.expenseCents }));
  }

  private async total(filter: SpendingFilter, direction: Direction): Promise<number> {
    const [row] = await this.db
      .select({ amountCents: amount() })
      .from(transactions)
      .where(scope(filter, direction));
    return row?.amountCents ?? 0;
  }
}

const effectiveAmount = sql`coalesce(${transactions.actualAmountCents}, ${transactions.expectedAmountCents})`;

function amount(): SQL<number> {
  return sql<number>`sum(${effectiveAmount})`;
}

function scope(filter: SpendingFilter, direction: Direction): SQL | undefined {
  return and(
    eq(transactions.userId, filter.userId),
    ne(transactions.status, "cancelled"),
    eq(transactions.direction, direction),
    gte(transactions.dueDate, filter.from),
    lt(transactions.dueDate, filter.to),
  );
}
