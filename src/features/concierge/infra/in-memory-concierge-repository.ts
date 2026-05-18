import type {
  AppendMessageInput,
  ConciergeRepository,
  CreateSessionInput,
} from "../domain/concierge-repository.ts";
import type { PersistedMessage } from "../domain/message.ts";
import type { ConciergeSession } from "../domain/session.ts";

interface MutableSession {
  id: string;
  tenantId: string;
  visitorId: string;
  page: string | null;
  startedAt: Date;
  lastActivityAt: Date;
}

export class InMemoryConciergeRepository implements ConciergeRepository {
  private readonly sessions = new Map<string, MutableSession>();
  private readonly messages = new Map<string, PersistedMessage[]>();
  private idCounter = 0;
  private readonly now: () => Date;

  constructor(options?: { now?: () => Date }) {
    this.now = options?.now ?? (() => new Date());
  }

  createSession(input: CreateSessionInput): Promise<ConciergeSession> {
    const id = this.nextId();
    const timestamp = this.now();
    const session: MutableSession = {
      id,
      tenantId: input.tenantId,
      visitorId: input.visitorId,
      page: input.page,
      startedAt: timestamp,
      lastActivityAt: timestamp,
    };
    this.sessions.set(id, session);
    this.messages.set(id, []);
    return Promise.resolve(this.freezeSession(session));
  }

  appendMessage(input: AppendMessageInput): Promise<PersistedMessage> {
    const session = this.sessions.get(input.sessionId);
    if (!session) {
      throw new Error(`Session ${input.sessionId} not found`);
    }
    if (session.tenantId !== input.tenantId) {
      throw new Error(`Session ${input.sessionId} does not belong to tenant ${input.tenantId}`);
    }
    const message: PersistedMessage = {
      id: this.nextId(),
      sessionId: input.sessionId,
      role: input.role,
      content: input.content,
      metadata: input.metadata ?? {},
      createdAt: this.now(),
    };
    const list = this.messages.get(input.sessionId);
    if (!list) {
      throw new Error(`Session ${input.sessionId} has no message list`);
    }
    list.push(message);
    session.lastActivityAt = message.createdAt;
    return Promise.resolve(message);
  }

  listMessages(tenantId: string, sessionId: string): Promise<readonly PersistedMessage[]> {
    const session = this.sessions.get(sessionId);
    if (!session || session.tenantId !== tenantId) {
      return Promise.resolve([]);
    }
    return Promise.resolve(this.messages.get(sessionId) ?? []);
  }

  touchSession(tenantId: string, sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session && session.tenantId === tenantId) {
      session.lastActivityAt = this.now();
    }
    return Promise.resolve();
  }

  private nextId(): string {
    this.idCounter += 1;
    return `00000000-0000-0000-0000-${this.idCounter.toString().padStart(12, "0")}`;
  }

  private freezeSession(session: MutableSession): ConciergeSession {
    return {
      id: session.id,
      tenantId: session.tenantId,
      visitorId: session.visitorId,
      page: session.page,
      startedAt: session.startedAt,
      lastActivityAt: session.lastActivityAt,
    };
  }
}
