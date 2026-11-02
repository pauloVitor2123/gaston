export type ReplyAction = { id: string; label: string };

export type BotReply = { text: string; actions?: ReplyAction[] };
