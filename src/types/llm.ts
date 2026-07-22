export interface ILLMClient {
  call(userPrompt: string, systemPrompt?: string): Promise<string>;
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
