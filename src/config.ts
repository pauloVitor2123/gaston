import type { LLMClientConfig } from "@/types/llm";

export const LLM_ENDPOINTS = {
  openrouter: "https://openrouter.ai/api/v1",
  openai: "https://api.openai.com/v1",
} as const;

export interface LLMEnv {
  OPENROUTER_API_KEY: string;
  OPENAI_API_KEY: string;
  COLLECTION_MODEL: string;
  COLLECTION_FALLBACK_MODEL: string;
}

export interface LLMConfigs {
  primary: LLMClientConfig;
  fallback: LLMClientConfig;
}

export function buildLLMConfigs(env: LLMEnv): LLMConfigs {
  return {
    primary: { url: LLM_ENDPOINTS.openai, apiKey: env.OPENAI_API_KEY, model: env.COLLECTION_MODEL },
    fallback: {
      url: LLM_ENDPOINTS.openrouter,
      apiKey: env.OPENROUTER_API_KEY,
      model: env.COLLECTION_FALLBACK_MODEL,
    },
  };
}
