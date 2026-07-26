import type { ExtractionContext, ExtractionResult } from "./types";

export function buildSystemPrompt(context: ExtractionContext): string {
  return `Você é um assistente financeiro. Extraia dados estruturados da mensagem do usuário em português.

Responda APENAS com o JSON abaixo, sem texto adicional:
{
  "intent": "record_expense" | "record_income" | "query_balance" | "mark_paid" | "unknown",
  "description": string | null,
  "amount_cents": number (R$ convertido em centavos) | null,
  "date": "YYYY-MM-DD" (padrão: ${context.today}) | null,
  "payment_method": "card" | "pix" | "cash" | "debit" | null,
  "card_name": string | null,
  "category_name": string | null,
  "category_confidence": "high" | "low",
  "installments_count": number | null,
  "direction": "in" | "out"
}

Categorias disponíveis: ${context.categories.join(", ")}
Cartões disponíveis: ${context.cards.join(", ")}

Regras:
- "Nx" no valor indica parcelamento; preencha installments_count
- category_confidence = "low" se não tiver certeza da categoria
- direction = "out" para gastos, "in" para receitas
- date padrão: ${context.today}`;
}

export function buildDisambiguationPrompt(
  message: string,
  result: ExtractionResult,
  context: ExtractionContext,
): string {
  return `Mensagem do usuário: "${message}"
Descrição extraída: "${result.description ?? ""}"

Qual categoria da lista abaixo melhor se encaixa?
${context.categories.join("\n")}

Responda APENAS com o nome exato da categoria.`;
}
