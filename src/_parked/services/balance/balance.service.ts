import type { IBalanceRepository, IPayableLister, IUserRepository } from "@/types/repository";
import type { User } from "@/db/schema";
import { firstOfNextMonth } from "@/services/dates";

export interface BalanceSummary {
  base: number;
  receivedSince: number;
  spentSince: number;
  onHand: number;
  toReceive: number;
  toPay: number;
  projected: number;
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

  async summarize(user: User, today: Date): Promise<BalanceSummary | null> {
    if (user.balanceSetAt === null) return null;

    const monthEnd = firstOfNextMonth(today);
    const since = user.balanceSetAt;
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
