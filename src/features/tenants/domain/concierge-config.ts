export type LlmProvider = "groq" | "anthropic" | "openai";

export interface ConciergeConfig {
  readonly persona: string;
  readonly provider: LlmProvider;
  readonly model: string;
  readonly temperature?: number;
  readonly enabledTools: readonly string[];
  readonly forbiddenTopics?: readonly string[];
}
