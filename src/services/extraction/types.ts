export type Intent = "record_expense" | "record_income" | "query_balance" | "mark_paid" | "unknown";
export type PaymentMethod = "card" | "pix" | "cash" | "debit";
export type Direction = "in" | "out";
export type Confidence = "high" | "low";
export type Mantra = "Doar" | "Se Pagar" | "Pagas as Contas";

export interface ExtractionResult {
  intent: Intent;
  description?: string;
  amount_cents?: number;
  date?: string;
  payment_method?: PaymentMethod;
  card_name?: string;
  category_name?: string;
  category_confidence: Confidence;
  installments_count?: number;
  direction: Direction;
  mantra?: Mantra;
}

export interface ExtractionContext {
  categories: string[];
  cards: string[];
  today: string;
}
