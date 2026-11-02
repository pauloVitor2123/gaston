import { describe, expect, it } from "vitest";
import type { Category } from "@/db/schema";
import {
  canonicalizeSubcategory,
  childrenOf,
  inferCategory,
  isTopLevel,
  matchCategory,
  resolveCategory,
  resolveCategoryTree,
} from "@/services/collection/category-rules";

function category(id: number, name: string, synonyms: string[] = []): Category {
  return { id, userId: 1, name, synonyms, parentId: null };
}

function subcategory(id: number, name: string, parentId: number, synonyms: string[] = []): Category {
  return { id, userId: 1, name, synonyms, parentId };
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

describe("resolveCategoryTree", () => {
  const transporte = category(2, "Transporte", ["transporte"]);
  const app = subcategory(20, "App", 2, ["uber", "99", "ônibus"]);
  const combustivel = subcategory(21, "Combustível", 2, ["gasolina", "gnv"]);
  const tree: Category[] = [transporte, app, combustivel, category(4, "Outros")];

  it("resolves the top category via a child's synonym and returns the matched subcategory", () => {
    const result = resolveCategoryTree(undefined, "gasolina 100", tree);
    expect(result?.category.name).toBe("Transporte");
    expect(result?.subcategory?.name).toBe("Combustível");
  });

  it("resolves the top category by its own synonym with no subcategory when no child matches", () => {
    const result = resolveCategoryTree(undefined, "paguei o transporte do mês", tree);
    expect(result?.category.name).toBe("Transporte");
    expect(result?.subcategory).toBeNull();
  });

  it("resolves the top category from the explicit name even when the description matches nothing", () => {
    const result = resolveCategoryTree("Transporte", "paguei 30", tree);
    expect(result?.category.name).toBe("Transporte");
    expect(result?.subcategory).toBeNull();
  });

  it("infers the subcategory within the children when the explicit name is given", () => {
    const result = resolveCategoryTree("Transporte", "uber até o centro", tree);
    expect(result?.category.name).toBe("Transporte");
    expect(result?.subcategory?.name).toBe("App");
  });

  describe("most specific term wins across the tree", () => {
    const manutencao = subcategory(22, "Manutenção", 2, ["manutenção", "mecânico"]);
    const gnv = subcategory(23, "Combustível", 2, ["gnv", "gás"]);
    const moradia = category(3, "Moradia", ["aluguel", "manutenção da casa", "botijão"]);
    const driverTree: Category[] = [transporte, manutencao, gnv, moradia, category(4, "Outros")];

    it("resolves a bare ambiguous term to the vehicle subcategory", () => {
      const result = resolveCategoryTree(undefined, "manutenção 400", driverTree);
      expect(result?.category.name).toBe("Transporte");
      expect(result?.subcategory?.name).toBe("Manutenção");
    });

    it("prefers a longer top-level phrase over a shorter subcategory term", () => {
      const result = resolveCategoryTree(undefined, "manutenção da casa 200", driverTree);
      expect(result?.category.name).toBe("Moradia");
      expect(result?.subcategory).toBeNull();
    });

    it("prefers the longer top-level term when both appear in the text", () => {
      const result = resolveCategoryTree(undefined, "botijão de gás 120", driverTree);
      expect(result?.category.name).toBe("Moradia");
    });

    it("keeps a bare 'gás' as vehicle fuel", () => {
      const result = resolveCategoryTree(undefined, "gás 80", driverTree);
      expect(result?.subcategory?.name).toBe("Combustível");
    });
  });
});

describe("canonicalizeSubcategory", () => {
  const transporte = category(2, "Transporte", ["transporte"]);
  const app = subcategory(20, "App", 2, ["uber", "99"]);
  const combustivel = subcategory(21, "Combustível", 2, ["gasolina", "gnv"]);
  const all: Category[] = [transporte, app, combustivel, category(4, "Outros")];

  it("reuses an existing child matched by name, case-insensitive", () => {
    const result = canonicalizeSubcategory("combustível", transporte, all);
    expect(result).toEqual({ kind: "existing", subcategory: combustivel });
  });

  it("reuses an existing child matched by one of its synonyms", () => {
    const result = canonicalizeSubcategory("gnv", transporte, all);
    expect(result).toEqual({ kind: "existing", subcategory: combustivel });
  });

  it("proposes a new subcategory, trimmed, when the name matches no existing child", () => {
    const result = canonicalizeSubcategory("  Seguro  ", transporte, all);
    expect(result).toEqual({ kind: "new", name: "Seguro" });
  });

  it("returns none when no name is proposed", () => {
    expect(canonicalizeSubcategory(undefined, transporte, all)).toEqual({ kind: "none" });
  });

  it("scopes matching to children of the given category, not other categories", () => {
    const alimentacao = category(5, "Alimentação");
    const mercado = subcategory(50, "Mercado", 5, ["mercado"]);
    const withFood = [...all, alimentacao, mercado];
    const result = canonicalizeSubcategory("Mercado", transporte, withFood);
    expect(result).toEqual({ kind: "new", name: "Mercado" });
  });
});

describe("2-level guard helpers", () => {
  const transporte = category(2, "Transporte");
  const app = subcategory(20, "App", 2);
  const combustivel = subcategory(21, "Combustível", 2);
  const all: Category[] = [transporte, app, combustivel];

  it("isTopLevel distinguishes a parent from a child", () => {
    expect(isTopLevel(transporte)).toBe(true);
    expect(isTopLevel(app)).toBe(false);
  });

  it("childrenOf returns only the subcategories of the given category", () => {
    expect(childrenOf(transporte, all)).toEqual([app, combustivel]);
    expect(childrenOf(app, all)).toEqual([]);
  });
});
