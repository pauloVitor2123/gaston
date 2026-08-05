import type { IBalanceRepository, IPayableLister, IUserRepository } from "@/types/repository";
import type { User } from "@/db/schema";
import { parseUtcDate, utcDayClamped } from "@/services/dates";

export interface BalanceSummary {
  base: number;
  receivedSince: number;
  spentSince: number;
  onHand: number;
  toReceive: number;
  toPay: number;
  projected: number;
}

function firstOfNextMonth(today: string): Date {
  const date = parseUtcDate(today);
  return utcDayClamped(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

export class BalanceService {
  constructor(
    private readonly balanceRepo: IBalanceRepository,
    private readonly payables: IPayableLister,
    private readonly userRepo: IUserRepository,
  ) {}

  async setBalance(userId: number, amountCents: number, at: Date): Promise<void> {
    await this.userRepo.setBalance(userId, amountCents, at);
  }

  async summarize(user: User, today: string): Promise<BalanceSummary> {
    const monthEnd = firstOfNextMonth(today);
    const since = user.balanceSetAt ?? new Date(0);
    const [receivedSince, spentSince, toReceive, payables] = await Promise.all([
      this.balanceRepo.sumSettledSince(user.id, "in", since),
      this.balanceRepo.sumSettledSince(user.id, "out", since),
      this.balanceRepo.sumPendingUntil(user.id, "in", monthEnd),
      this.payables.listPayables(user.id),
    ]);

    const toPay = payables
      .filter((p) => p.dueDate.getTime() < monthEnd.getTime())
      .reduce((sum, p) => sum + p.amountCents, 0);
    const onHand = user.balanceCents + receivedSince - spentSince;

    return {
      base: user.balanceCents,
      receivedSince,
      spentSince,
      onHand,
      toReceive,
      toPay,
      projected: onHand + toReceive - toPay,
    };
  }
}
