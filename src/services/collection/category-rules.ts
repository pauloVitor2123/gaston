import type { Category } from "@/db/schema";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

export function matchCategory(
  term: string | undefined,
  categories: Category[],
): Category | null {
  if (!term) return null;
  const normalized = normalize(term);
  return (
    categories.find(
      (c) =>
        c.name.toLowerCase() === normalized ||
        c.synonyms.some((s) => s.toLowerCase() === normalized),
    ) ?? null
  );
}

export function inferCategory(description: string, categories: Category[]): Category | null {
  return mostSpecificMatch(description, categories)?.category ?? null;
}

type TermMatch = { category: Category; length: number };

function mostSpecificMatch(description: string, categories: Category[]): TermMatch | null {
  const tokens = new Set(tokenize(description));
  const lower = normalize(description);
  let best: TermMatch | null = null;
  for (const category of categories) {
    for (const term of [category.name, ...category.synonyms]) {
      const normalized = term.toLowerCase();
      const matched = normalized.includes(" ")
        ? lower.includes(normalized)
        : tokens.has(normalized);
      if (matched && (!best || normalized.length > best.length)) {
        best = { category, length: normalized.length };
      }
    }
  }
  return best;
}

export function resolveCategory(
  explicitName: string | undefined,
  description: string,
  categories: Category[],
): Category | null {
  return matchCategory(explicitName, categories) ?? inferCategory(description, categories);
}

export function isTopLevel(category: Category): boolean {
  return category.parentId === null;
}

export function childrenOf(category: Category, categories: Category[]): Category[] {
  return categories.filter((c) => c.parentId === category.id);
}

export type CategoryResolution = { category: Category; subcategory: Category | null };

export function resolveCategoryTree(
  explicitName: string | undefined,
  description: string,
  categories: Category[],
): CategoryResolution | null {
  const topLevel = categories.filter(isTopLevel);
  const explicit = matchCategory(explicitName, topLevel);
  if (explicit) {
    return { category: explicit, subcategory: inferCategory(description, childrenOf(explicit, categories)) };
  }
  let best: { resolution: CategoryResolution; length: number } | null = null;
  for (const category of topLevel) {
    const sub = mostSpecificMatch(description, childrenOf(category, categories));
    if (sub && (!best || sub.length > best.length)) {
      best = { resolution: { category, subcategory: sub.category }, length: sub.length };
    }
  }
  for (const category of topLevel) {
    const own = mostSpecificMatch(description, [category]);
    if (own && (!best || own.length > best.length)) {
      best = { resolution: { category, subcategory: null }, length: own.length };
    }
  }
  return best?.resolution ?? null;
}

export type SubcategoryMatch =
  | { kind: "existing"; subcategory: Category }
  | { kind: "new"; name: string }
  | { kind: "none" };

export function canonicalizeSubcategory(
  proposedName: string | undefined,
  category: Category,
  categories: Category[],
): SubcategoryMatch {
  const existing = matchCategory(proposedName, childrenOf(category, categories));
  if (existing) return { kind: "existing", subcategory: existing };
  const trimmed = proposedName?.trim();
  if (trimmed) return { kind: "new", name: trimmed };
  return { kind: "none" };
}
