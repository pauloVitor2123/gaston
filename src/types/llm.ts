// Contrato de um client de LLM. Services dependem desta interface, não de um provider concreto.
export interface ILLMClient {
  /** Chama o modelo; retorna o texto da resposta. systemPrompt é opcional. */
  call(userPrompt: string, systemPrompt?: string): Promise<string>;
}

// Config de um client compatível com a API OpenAI (OpenRouter, OpenAI, etc.).
// Model IDs vêm de wrangler vars; apiKey de secret. Trocar de modelo = mudar config.
export interface LLMClientConfig {
  url: string; // base, ex.: "https://openrouter.ai/api/v1"
  apiKey: string;
  model: string;
  referer?: string; // opcional: HTTP-Referer (atribuição no OpenRouter)
  title?: string; // opcional: X-Title (atribuição no OpenRouter)
}
