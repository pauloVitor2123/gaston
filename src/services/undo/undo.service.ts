import type { ITransactionRepository, IWorkLogRepository } from "@/types/repository";

export type UndoOutcome = "undone" | "already_undone" | "not_found";

export class UndoService {
  constructor(
    private readonly transactionRepo: ITransactionRepository,
    private readonly workLogRepo: IWorkLogRepository,
  ) {}

  async undo(userId: number, batchId: string): Promise<UndoOutcome> {
    const results = await Promise.all([
      this.transactionRepo.cancelBatch(userId, batchId),
      this.workLogRepo.cancelBatch(userId, batchId),
    ]);
    const total = results.reduce((sum, r) => sum + r.total, 0);
    const cancelled = results.reduce((sum, r) => sum + r.cancelled, 0);
    if (total === 0) return "not_found";
    return cancelled > 0 ? "undone" : "already_undone";
  }
}
