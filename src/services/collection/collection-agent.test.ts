import { describe, expect, it, vi } from "vitest";
import type { ILLMClient, ToolCallResult } from "@/types/llm";
import { CollectionAgent } from "@/services/collection/collection-agent";
import type { CollectionContext } from "@/services/collection/prompts";

const context: CollectionContext = {
  categories: ["Alimentação"],
  cards: ["Nubank"],
  today: "2026-07-31",
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
