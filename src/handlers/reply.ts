export type Choice = "yes" | "no";

export type ReplyAction = { id: string; label: string };

export type BotReply = { text: string; actions?: ReplyAction[] };

export function confirmActions(pendingId: number): ReplyAction[] {
  return [
    { id: `${pendingId}:yes`, label: "✅ Confirmar" },
    { id: `${pendingId}:no`, label: "✕ Não" },
  ];
}

export function parseCallbackData(data: string): { pendingId: number; choice: Choice } | null {
  const match = /^(\d+):(yes|no)$/.exec(data.trim());
  if (!match) return null;
  return { pendingId: Number(match[1]), choice: match[2] as Choice };
}
