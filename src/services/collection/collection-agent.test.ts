import { describe, expect, it, vi } from "vitest";
import type { ILLMClient, ToolCallResult } from "@/types/llm";
import { CollectionAgent } from "@/services/collection/collection-agent";
import type { AgentContext } from "@/services/collection/prompts";

const context: AgentContext = {
  categories: [{ name: "Alimentação", subcategories: [] }],
  platforms: ["Uber", "99"],
  today: "2026-07-31",
};

function agentReturning(result: ToolCallResult) {
  const llm = { callWithTools: vi.fn(async () => result) } as unknown as ILLMClient;
  return { agent: new CollectionAgent(llm), llm };
}

describe("CollectionAgent.run", () => {
  it("returns a single-item drafts turn when the model emits one valid record_transaction", async () => {
    const { agent } = agentReturning({
      toolCalls: [
        {
          name: "record_transaction",
          arguments: { description: "almoço", amount_cents: 3500 },
        },
      ],
    });

    const turn = await agent.run([{ role: "user", content: "almoço 35" }], context);

    expect(turn).toEqual({
      kind: "drafts",
      drafts: [{ description: "almoço", amount_cents: 3500 }],
      incomes: [],
    });
  });

  it("returns every valid draft when the model emits several record_transaction calls", async () => {
    const { agent } = agentReturning({
      toolCalls: [
        { name: "record_transaction", arguments: { description: "gasolina", amount_cents: 10000 } },
        { name: "record_transaction", arguments: { description: "estacionamento", amount_cents: 5000 } },
      ],
    });

    const turn = await agent.run([{ role: "user", content: "gasolina 100 e estacionamento 50" }], context);

    expect(turn).toEqual({
      kind: "drafts",
      drafts: [
        { description: "gasolina", amount_cents: 10000 },
        { description: "estacionamento", amount_cents: 5000 },
      ],
      incomes: [],
    });
  });

  it("drops invalid drafts but keeps the valid ones in the batch", async () => {
    const { agent } = agentReturning({
      toolCalls: [
        { name: "record_transaction", arguments: { description: "gasolina", amount_cents: 10000 } },
        { name: "record_transaction", arguments: { description: "sem valor" } },
      ],
    });

    const turn = await agent.run([{ role: "user", content: "x" }], context);

    expect(turn).toEqual({
      kind: "drafts",
      drafts: [{ description: "gasolina", amount_cents: 10000 }],
      incomes: [],
    });
  });

  it("gives expenses precedence: discards query_spending when a record call is present", async () => {
    const { agent } = agentReturning({
      toolCalls: [
        { name: "record_transaction", arguments: { description: "gasolina", amount_cents: 10000 } },
        { name: "query_spending", arguments: { group_by: "category", from: "2026-08-01", to: "2026-08-31" } },
      ],
    });

    const turn = await agent.run([{ role: "user", content: "gasolina 100 e quanto gastei?" }], context);

    expect(turn).toEqual({
      kind: "drafts",
      drafts: [{ description: "gasolina", amount_cents: 10000 }],
      incomes: [],
    });
  });

  it("returns incomes alongside expenses in one records turn", async () => {
    const { agent } = agentReturning({
      toolCalls: [
        { name: "record_transaction", arguments: { description: "gnv", amount_cents: 9000 } },
        { name: "record_income", arguments: { amount_cents: 28000, platform_name: "Uber" } },
      ],
    });

    const turn = await agent.run([{ role: "user", content: "gnv 90 e recebi 280 da uber" }], context);

    expect(turn).toEqual({
      kind: "drafts",
      drafts: [{ description: "gnv", amount_cents: 9000 }],
      incomes: [{ amount_cents: 28000, platform_name: "Uber" }],
    });
  });

  it("returns an income-only turn and drops invalid incomes", async () => {
    const { agent } = agentReturning({
      toolCalls: [
        { name: "record_income", arguments: { amount_cents: 30000 } },
        { name: "record_income", arguments: { platform_name: "99" } },
      ],
    });

    const turn = await agent.run([{ role: "user", content: "faturamento 300" }], context);

    expect(turn).toEqual({ kind: "drafts", drafts: [], incomes: [{ amount_cents: 30000 }] });
  });

  it("returns a question when the model responds with text", async () => {
    const { agent } = agentReturning({ content: "Qual o valor?" });

    const turn = await agent.run([{ role: "user", content: "gastei no mercado" }], context);

    expect(turn).toEqual({ kind: "question", text: "Qual o valor?" });
  });

  it("falls back to a question when every tool call is invalid (missing required field)", async () => {
    const { agent } = agentReturning({
      toolCalls: [{ name: "record_transaction", arguments: { description: "x" } }],
    });

    const turn = await agent.run([{ role: "user", content: "comprei algo" }], context);

    expect(turn.kind).toBe("question");
  });

  it("returns a query turn when the model calls query_spending", async () => {
    const { agent } = agentReturning({
      toolCalls: [
        {
          name: "query_spending",
          arguments: { group_by: "category", from: "2026-08-01", to: "2026-08-31" },
        },
      ],
    });

    const turn = await agent.run([{ role: "user", content: "gastos por categoria desse mês" }], context);

    expect(turn).toEqual({
      kind: "query",
      params: { group_by: "category", from: "2026-08-01", to: "2026-08-31" },
    });
  });

  it("passes the system prompt and tool definitions to the client", async () => {
    const { agent, llm } = agentReturning({ content: "?" });

    await agent.run([{ role: "user", content: "oi" }], context);

    const [messages, tools, system] = (llm.callWithTools as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(messages).toEqual([{ role: "user", content: "oi" }]);
    expect(tools.map((t: { name: string }) => t.name)).toEqual([
      "record_transaction",
      "record_income",
      "query_spending",
    ]);
    expect(system).toContain("Alimentação");
    expect(system).toContain("Uber");
  });
});
