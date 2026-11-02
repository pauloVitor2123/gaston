import { describe, expect, it, vi } from "vitest";
import type { BatchCancellation, ITransactionRepository, IWorkLogRepository } from "@/types/repository";
import { UndoService } from "@/services/undo/undo.service";

function service(transactions: BatchCancellation, workLogs: BatchCancellation) {
  const transactionRepo = { cancelBatch: vi.fn(async () => transactions) } as unknown as ITransactionRepository;
  const workLogRepo = { cancelBatch: vi.fn(async () => workLogs) } as unknown as IWorkLogRepository;
  return { undo: new UndoService(transactionRepo, workLogRepo), transactionRepo, workLogRepo };
}

describe("UndoService.undo", () => {
  it("cancels the batch in both stores and reports undone", async () => {
    const { undo, transactionRepo, workLogRepo } = service({ total: 2, cancelled: 2 }, { total: 1, cancelled: 1 });

    expect(await undo.undo(1, "b")).toBe("undone");
    expect(transactionRepo.cancelBatch).toHaveBeenCalledWith(1, "b");
    expect(workLogRepo.cancelBatch).toHaveBeenCalledWith(1, "b");
  });

  it("reports undone when only work logs were cancelled", async () => {
    const { undo } = service({ total: 0, cancelled: 0 }, { total: 1, cancelled: 1 });
    expect(await undo.undo(1, "b")).toBe("undone");
  });

  it("reports already_undone when the batch exists but nothing was left", async () => {
    const { undo } = service({ total: 2, cancelled: 0 }, { total: 0, cancelled: 0 });
    expect(await undo.undo(1, "b")).toBe("already_undone");
  });

  it("reports not_found for an unknown batch", async () => {
    const { undo } = service({ total: 0, cancelled: 0 }, { total: 0, cancelled: 0 });
    expect(await undo.undo(1, "b")).toBe("not_found");
  });
});
