// Erros da camada de LLM. O LLMProvider (orquestrador) usa o tipo pra decidir o fallback.

export class LLMError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly endpoint?: string,
  ) {
    super(message);
    this.name = "LLMError";
  }
}

/**
 * Créditos/limite esgotados neste provider (HTTP 402/429).
 * Sinaliza ao orquestrador que deve tentar o próximo client da cadeia;
 * se todos falharem assim, o erro é propagado ao usuário.
 */
export class CreditsExhaustedError extends LLMError {
  constructor(message: string, status?: number, endpoint?: string) {
    super(message, status, endpoint);
    this.name = "CreditsExhaustedError";
  }
}
