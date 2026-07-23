import { describe, expect, it } from "vitest";
import { buildLLMConfigs, LLM_ENDPOINTS, type LLMEnv } from "./config";

const env: LLMEnv = {
  OPENROUTER_API_KEY: "or-key",
  OPENAI_API_KEY: "oai-key",
  LLM1_MODEL: "llm1",
  LLM2_MODEL: "llm2",
  FALLBACK_MODEL: "fb",
};

describe("buildLLMConfigs", () => {
  it("llm1 and llm2 use OpenRouter; fallback uses OpenAI", () => {
    const configs = buildLLMConfigs(env);

    expect(configs.llm1).toEqual({ url: LLM_ENDPOINTS.openrouter, apiKey: "or-key", model: "llm1" });
    expect(configs.llm2).toEqual({ url: LLM_ENDPOINTS.openrouter, apiKey: "or-key", model: "llm2" });
    expect(configs.fallback).toEqual({ url: LLM_ENDPOINTS.openai, apiKey: "oai-key", model: "fb" });
  });
});
