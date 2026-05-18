import type {
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmProvider,
} from "../domain/llm-provider.ts";
import { LlmProviderError } from "../domain/llm-provider.ts";

export interface GroqLlmProviderOptions {
  readonly apiKey: string;
  readonly endpoint?: string;
  readonly timeoutMs?: number;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
}

interface GroqChatCompletionPayload {
  readonly model: string;
  readonly messages: ReadonlyArray<{ readonly role: string; readonly content: string }>;
  readonly temperature?: number;
  readonly max_tokens: number;
  readonly reasoning_effort?: "low" | "medium" | "high";
}

interface GroqChatCompletionResponse {
  readonly choices?: ReadonlyArray<{ readonly message?: { readonly content?: string } }>;
  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
  };
}

const DEFAULT_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_MAX_TOKENS = 1024;

export class GroqLlmProvider implements LlmProvider {
  readonly name = "groq";
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(options: GroqLlmProviderOptions) {
    this.apiKey = options.apiKey;
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? (() => Date.now());
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    const startedAt = this.now();
    const payload: GroqChatCompletionPayload = {
      model: request.model,
      messages: [
        { role: "system", content: request.systemPrompt },
        ...request.messages.map((m) => ({ role: this.roleFor(m.role), content: m.content })),
      ],
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      reasoning_effort: "low",
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      throw new LlmProviderError("groq request failed", error);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new LlmProviderError(`groq returned ${response.status}`);
    }

    let body: GroqChatCompletionResponse;
    try {
      body = (await response.json()) as GroqChatCompletionResponse;
    } catch (error) {
      throw new LlmProviderError("groq returned invalid JSON", error);
    }

    const content = body.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new LlmProviderError("groq returned empty content");
    }

    return {
      content,
      model: request.model,
      latencyMs: this.now() - startedAt,
      ...(body.usage && {
        tokenUsage: {
          prompt: body.usage.prompt_tokens ?? 0,
          completion: body.usage.completion_tokens ?? 0,
        },
      }),
    };
  }

  private roleFor(role: "visitor" | "concierge" | "system"): string {
    switch (role) {
      case "visitor":
        return "user";
      case "concierge":
        return "assistant";
      case "system":
        return "system";
    }
  }
}
