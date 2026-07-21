import type { LLMClientConfig } from "@/types/llm";

export const LLM_ENDPOINTS = {
  openrouter: "https://openrouter.ai/api/v1",
  openai: "https://api.openai.com/v1",
} as const;

export interface LLMEnv {
  OPENROUTER_API_KEY: string;
  OPENAI_API_KEY: string;
  LLM1_MODEL: string;
  LLM2_MODEL: string;
  FALLBACK_MODEL: string;
}

export interface LLMConfigs {
  llm1: LLMClientConfig;
  llm2: LLMClientConfig;
  fallback: LLMClientConfig;
}

export function buildLLMConfigs(env: LLMEnv): LLMConfigs {
  return {
    llm1: { url: LLM_ENDPOINTS.openrouter, apiKey: env.OPENROUTER_API_KEY, model: env.LLM1_MODEL },
    llm2: { url: LLM_ENDPOINTS.openrouter, apiKey: env.OPENROUTER_API_KEY, model: env.LLM2_MODEL },
    fallback: { url: LLM_ENDPOINTS.openai, apiKey: env.OPENAI_API_KEY, model: env.FALLBACK_MODEL },
  };
}
