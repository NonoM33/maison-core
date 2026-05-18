import type { MessageMetadata, MessageRole, PersistedMessage } from "./message.ts";
import type { ConciergeSession } from "./session.ts";

export interface CreateSessionInput {
  readonly tenantId: string;
  readonly visitorId: string;
  readonly page: string | null;
}

export interface AppendMessageInput {
  readonly tenantId: string;
  readonly sessionId: string;
  readonly role: MessageRole;
  readonly content: string;
  readonly metadata?: MessageMetadata;
}

export interface ConciergeRepository {
  createSession(input: CreateSessionInput): Promise<ConciergeSession>;
  appendMessage(input: AppendMessageInput): Promise<PersistedMessage>;
  listMessages(tenantId: string, sessionId: string): Promise<readonly PersistedMessage[]>;
  touchSession(tenantId: string, sessionId: string): Promise<void>;
}
