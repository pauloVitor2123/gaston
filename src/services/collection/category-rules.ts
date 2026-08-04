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
  const tokens = new Set(tokenize(description));
  const lower = normalize(description);
  for (const category of categories) {
    for (const term of [category.name, ...category.synonyms]) {
      const normalized = term.toLowerCase();
      const matched = normalized.includes(" ")
        ? lower.includes(normalized)
        : tokens.has(normalized);
      if (matched) return category;
    }
  }
  return null;
}

export function resolveCategory(
  explicitName: string | undefined,
  description: string,
  categories: Category[],
): Category | null {
  return matchCategory(explicitName, categories) ?? inferCategory(description, categories);
}
