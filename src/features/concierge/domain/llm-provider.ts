import type { Message } from "./message.ts";

export interface LlmCompletionRequest {
  readonly systemPrompt: string;
  readonly messages: readonly Message[];
  readonly model: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
}

export interface LlmCompletionResponse {
  readonly content: string;
  readonly model: string;
  readonly latencyMs: number;
  readonly tokenUsage?: {
    readonly prompt: number;
    readonly completion: number;
  };
}

export interface LlmProvider {
  readonly name: string;
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse>;
}

export class LlmProviderError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "LlmProviderError";
  }
}
