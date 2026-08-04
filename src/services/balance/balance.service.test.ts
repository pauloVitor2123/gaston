import { describe, expect, it, vi } from "vitest";
import type { IBalanceRepository, IPayableLister } from "@/types/repository";
import type { Payable } from "@/services/payment/payment.service";
import type { User } from "@/db/schema";
import { BalanceService } from "@/services/balance/balance.service";

const user = {
  id: 1,
  balanceCents: 500000,
  balanceSetAt: new Date("2026-08-01"),
} as User;

function makeService(opts: {
  settled?: (dir: "in" | "out") => number;
  pendingIn?: number;
  payables?: Payable[];
}) {
  const balanceRepo = {
    sumSettledSince: vi.fn(async (_u: number, dir: "in" | "out") => opts.settled?.(dir) ?? 0),
    sumPendingUntil: vi.fn(async () => opts.pendingIn ?? 0),
  } as unknown as IBalanceRepository;
  const payables = {
    listPayables: vi.fn(async () => opts.payables ?? []),
  } as unknown as IPayableLister;
  return { service: new BalanceService(balanceRepo, payables), balanceRepo, payables };
}

describe("BalanceService.summarize", () => {
  it("computes on-hand as base + realized income - realized spend since balanceSetAt", async () => {
    const { service } = makeService({
      settled: (dir) => (dir === "in" ? 300000 : 120000),
    });
    const summary = await service.summarize(user, "2026-08-15");
    expect(summary.onHand).toBe(500000 + 300000 - 120000);
  });

  it("projects month-end as on-hand + to-receive - to-pay (payables due this month)", async () => {
    const payables: Payable[] = [
      { type: "transaction", id: 1, description: "aluguel", amountCents: 312035, dueDate: new Date("2026-08-10") },
      { type: "transaction", id: 2, description: "próximo mês", amountCents: 999999, dueDate: new Date("2026-09-05") },
    ];
    const { service } = makeService({
      settled: (dir) => (dir === "in" ? 0 : 0),
      pendingIn: 200000,
      payables,
    });
    const summary = await service.summarize(user, "2026-08-15");
    expect(summary.toPay).toBe(312035);
    expect(summary.toReceive).toBe(200000);
    expect(summary.projected).toBe(500000 + 200000 - 312035);
  });

  it("queries realized sums since the user's balanceSetAt and receivables until month end", async () => {
    const { service, balanceRepo } = makeService({});
    await service.summarize(user, "2026-08-15");
    expect(balanceRepo.sumSettledSince).toHaveBeenCalledWith(1, "in", user.balanceSetAt);
    expect(balanceRepo.sumSettledSince).toHaveBeenCalledWith(1, "out", user.balanceSetAt);
    expect(balanceRepo.sumPendingUntil).toHaveBeenCalledWith(1, "in", new Date(Date.UTC(2026, 8, 1)));
  });
});
