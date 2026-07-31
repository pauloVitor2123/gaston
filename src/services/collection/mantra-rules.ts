import type { Mantra } from "@/services/collection/draft";

export function applyMantraRules(description: string): Mantra {
  const lower = description.toLowerCase();
  if (/dízimo|doação/.test(lower)) return "Doar";
  if (/totalpass|academia|terapia/.test(lower)) return "Se Pagar";
  return "Pagas as Contas";
}
