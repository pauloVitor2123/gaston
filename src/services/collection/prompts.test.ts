import { describe, expect, it } from "vitest";
import { buildCollectionSystemPrompt } from "@/services/collection/prompts";
import { PLACEHOLDER_DESCRIPTION } from "@/services/collection/draft";

const context = { categories: ["Alimentação", "Outros"], today: "2026-08-19" };

describe("buildCollectionSystemPrompt", () => {
  it("forbids asking for the date", () => {
    const prompt = buildCollectionSystemPrompt(context).toLowerCase();
    expect(prompt).toContain("nunca pergunte a data");
  });

  it("instructs the placeholder for context-less expenses", () => {
    const prompt = buildCollectionSystemPrompt(context);
    expect(prompt).toContain(PLACEHOLDER_DESCRIPTION);
  });

  it("lists the available categories and today", () => {
    const prompt = buildCollectionSystemPrompt(context);
    expect(prompt).toContain("Alimentação");
    expect(prompt).toContain("2026-08-19");
  });
});
