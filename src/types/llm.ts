export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallResult {
  toolCall?: ToolCall;
  content?: string;
}

export interface ILLMClient {
  callWithTools(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    systemPrompt?: string,
  ): Promise<ToolCallResult>;
}

export interface LLMClientConfig {
  url: string;
  apiKey: string;
  model: string;
  referer?: string;
  title?: string;
}

export interface LLMAttemptLog {
  latencyMs: number;
  success: boolean;
  error?: string;
}

export interface IMetricsService {
  logAttempt(entry: LLMAttemptLog): void | Promise<void>;
}
