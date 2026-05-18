export type MessageRole = "visitor" | "concierge" | "system";

export interface Message {
  readonly role: MessageRole;
  readonly content: string;
}

export interface PersistedMessage extends Message {
  readonly id: string;
  readonly sessionId: string;
  readonly createdAt: Date;
  readonly metadata: MessageMetadata;
}

export interface MessageMetadata {
  readonly provider?: string;
  readonly model?: string;
  readonly latencyMs?: number;
  readonly fallback?: boolean;
  readonly tokenUsage?: {
    readonly prompt: number;
    readonly completion: number;
  };
}
