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

export class CreditsExhaustedError extends LLMError {
  constructor(message: string, status?: number, endpoint?: string) {
    super(message, status, endpoint);
    this.name = "CreditsExhaustedError";
  }
}
