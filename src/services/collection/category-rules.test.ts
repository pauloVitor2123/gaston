import { describe, expect, it } from "vitest";
import type { Category } from "@/db/schema";
import {
  inferCategory,
  matchCategory,
  resolveCategory,
} from "@/services/collection/category-rules";

function category(id: number, name: string, synonyms: string[] = []): Category {
  return { id, userId: 1, name, synonyms };
}

const categories: Category[] = [
  category(1, "Alimentação", ["comida", "almoço", "mercado", "ifood"]),
  category(2, "Transporte", ["uber", "99", "gasolina"]),
  category(3, "Moradia", ["aluguel", "conta de luz", "internet"]),
  category(4, "Outros", []),
];

describe("matchCategory", () => {
  it("matches by exact name, case-insensitive", () => {
    expect(matchCategory("transporte", categories)?.name).toBe("Transporte");
  });

  it("matches by synonym", () => {
    expect(matchCategory("ifood", categories)?.name).toBe("Alimentação");
  });

  it("returns null when nothing matches", () => {
    expect(matchCategory("investimentos", categories)).toBeNull();
  });

  it("returns null for undefined term", () => {
    expect(matchCategory(undefined, categories)).toBeNull();
  });
});

describe("inferCategory", () => {
  it("finds a synonym appearing as a word in free text", () => {
    expect(inferCategory("almoço com amigos", categories)?.name).toBe("Alimentação");
  });

  it("matches a numeric synonym as a whole token", () => {
    expect(inferCategory("corrida de 99 até em casa", categories)?.name).toBe("Transporte");
  });

  it("matches a multi-word synonym as a substring", () => {
    expect(inferCategory("paguei a conta de luz atrasada", categories)?.name).toBe("Moradia");
  });

  it("does not match a single-word synonym embedded in a larger word", () => {
    expect(inferCategory("reajuste do aluguelzinho combinado", categories)).toBeNull();
  });

  it("returns null when no synonym is present", () => {
    expect(inferCategory("gastei na loja da esquina", categories)).toBeNull();
  });
});

describe("resolveCategory", () => {
  it("prefers the explicit name when it resolves", () => {
    expect(resolveCategory("Transporte", "almoço no shopping", categories)?.name).toBe(
      "Transporte",
    );
  });

  it("falls back to inference when the explicit name is unknown", () => {
    expect(resolveCategory("Viagens", "uber para o aeroporto", categories)?.name).toBe(
      "Transporte",
    );
  });

  it("infers from the description when no explicit name is given", () => {
    expect(resolveCategory(undefined, "mercado do mês", categories)?.name).toBe("Alimentação");
  });

  it("returns null when neither the name nor the description resolve", () => {
    expect(resolveCategory(undefined, "comprei algo", categories)).toBeNull();
  });
});
