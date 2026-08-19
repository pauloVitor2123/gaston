import { describe, expect, it } from "vitest";
import { buildLLMConfigs, LLM_ENDPOINTS, type LLMEnv } from "./config";

const env: LLMEnv = {
  OPENROUTER_API_KEY: "or-key",
  OPENAI_API_KEY: "oai-key",
  COLLECTION_MODEL: "gpt-4o-mini",
  COLLECTION_FALLBACK_MODEL: "anthropic/claude-3.5-haiku",
  DASHBOARD_SECRET: "dash-secret",
};

describe("buildLLMConfigs", () => {
  it("primary uses OpenAI (paused credits); fallback uses OpenRouter", () => {
    const configs = buildLLMConfigs(env);

    expect(configs.primary).toEqual({
      url: LLM_ENDPOINTS.openai,
      apiKey: "oai-key",
      model: "gpt-4o-mini",
    });
    expect(configs.fallback).toEqual({
      url: LLM_ENDPOINTS.openrouter,
      apiKey: "or-key",
      model: "anthropic/claude-3.5-haiku",
    });
  });
});
