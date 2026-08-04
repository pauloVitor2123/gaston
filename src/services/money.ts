export function formatReais(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

export function parseBRLToCents(raw: string): number | null {
  let s = raw.replace(/r\$/i, "").replace(/\s/g, "");
  if (!s) return null;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    s = s.replace(",", ".");
  } else if (hasDot) {
    const segments = s.split(".");
    const isThousands = segments.length > 2 || segments[segments.length - 1]!.length === 3;
    if (isThousands) s = s.replace(/\./g, "");
  }

  const value = Number(s);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}
