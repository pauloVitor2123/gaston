import { describe, expect, it } from "vitest";
import { buildCollectionSystemPrompt } from "@/services/collection/prompts";
import { PLACEHOLDER_DESCRIPTION } from "@/services/collection/draft";

const context = {
  categories: [
    { name: "Alimentação", subcategories: [] },
    { name: "Transporte", subcategories: ["App", "Combustível"] },
    { name: "Outros", subcategories: [] },
  ],
  today: "2026-08-19",
};

describe("buildCollectionSystemPrompt", () => {
  it("forbids asking for the date", () => {
    const prompt = buildCollectionSystemPrompt(context).toLowerCase();
    expect(prompt).toContain("nunca pergunte a data");
  });

  it("instructs the placeholder for context-less expenses", () => {
    const prompt = buildCollectionSystemPrompt(context);
    expect(prompt).toContain(PLACEHOLDER_DESCRIPTION);
  });

  it("instructs one record_transaction call per expense for multi-expense messages", () => {
    const prompt = buildCollectionSystemPrompt(context).toLowerCase();
    expect(prompt).toContain("uma vez por gasto");
  });

  it("lists the available categories and today", () => {
    const prompt = buildCollectionSystemPrompt(context);
    expect(prompt).toContain("Alimentação");
    expect(prompt).toContain("2026-08-19");
  });

  it("lists each category with its known subcategories", () => {
    const prompt = buildCollectionSystemPrompt(context);
    expect(prompt).toContain("Transporte: App, Combustível");
  });

  it("instructs proposing and reusing a subcategory", () => {
    const prompt = buildCollectionSystemPrompt(context).toLowerCase();
    expect(prompt).toContain("subcategory_name");
    expect(prompt).toContain("reuse");
  });
});
