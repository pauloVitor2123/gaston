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
