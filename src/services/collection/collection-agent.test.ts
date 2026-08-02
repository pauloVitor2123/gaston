import { describe, expect, it, vi } from "vitest";
import type { ILLMClient, ToolCallResult } from "@/types/llm";
import { CollectionAgent } from "@/services/collection/collection-agent";
import type { AgentContext } from "@/services/collection/prompts";

const context: AgentContext = {
  categories: ["Alimentação"],
  cards: ["Nubank"],
  today: "2026-07-31",
  payables: [
    { type: "transaction", id: 55, description: "conta de luz", amountCents: 18000, dueDate: new Date("2026-08-10") },
  ],
  recentPayments: [
    { eventId: 900, description: "conta de luz", amountCents: 18000, paidAt: new Date("2026-07-30") },
  ],
  recurringBills: [],
};

function agentReturning(result: ToolCallResult) {
  const llm = { callWithTools: vi.fn(async () => result) } as unknown as ILLMClient;
  return { agent: new CollectionAgent(llm), llm };
}

describe("CollectionAgent.run", () => {
  it("returns a draft when the model emits a valid record_transaction tool call", async () => {
    const { agent } = agentReturning({
      toolCall: {
        name: "record_transaction",
        arguments: { intent: "record_expense", description: "almoço", amount_cents: 3500 },
      },
    });

    const turn = await agent.run([{ role: "user", content: "almoço 35" }], context);

    expect(turn).toEqual({
      kind: "draft",
      draft: { intent: "record_expense", description: "almoço", amount_cents: 3500 },
    });
  });

  it("returns a question when the model responds with text", async () => {
    const { agent } = agentReturning({ content: "Qual o valor?" });

    const turn = await agent.run([{ role: "user", content: "gastei no mercado" }], context);

    expect(turn).toEqual({ kind: "question", text: "Qual o valor?" });
  });

  it("falls back to a question when the tool call is invalid (missing required field)", async () => {
    const { agent } = agentReturning({
      toolCall: { name: "record_transaction", arguments: { intent: "record_expense", description: "x" } },
    });

    const turn = await agent.run([{ role: "user", content: "comprei algo" }], context);

    expect(turn.kind).toBe("question");
  });

  it("returns a pay turn when the model calls mark_paid", async () => {
    const { agent } = agentReturning({
      toolCall: { name: "mark_paid", arguments: { target_type: "transaction", target_id: 55, amount_cents: 21000 } },
    });

    const turn = await agent.run([{ role: "user", content: "paguei 210 da luz" }], context);

    expect(turn).toEqual({ kind: "pay", target: { type: "transaction", id: 55 }, amountCents: 21000 });
  });

  it("returns an undo turn when the model calls undo_payment", async () => {
    const { agent } = agentReturning({
      toolCall: { name: "undo_payment", arguments: { event_id: 900 } },
    });

    const turn = await agent.run([{ role: "user", content: "desfaz o pagamento da luz" }], context);

    expect(turn).toEqual({ kind: "undo", eventId: 900 });
  });

  it("passes the system prompt and tool definition to the client", async () => {
    const { agent, llm } = agentReturning({ content: "?" });

    await agent.run([{ role: "user", content: "oi" }], context);

    const [messages, tools, system] = (llm.callWithTools as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(messages).toEqual([{ role: "user", content: "oi" }]);
    expect(tools[0].name).toBe("record_transaction");
    expect(system).toContain("Alimentação");
    expect(system).toContain("Nubank");
  });
});
