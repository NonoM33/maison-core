import { and, asc, eq } from "drizzle-orm";
import type { DbClient } from "../../../shared/db/client.ts";
import type {
  AppendMessageInput,
  ConciergeRepository,
  CreateSessionInput,
} from "../domain/concierge-repository.ts";
import type { PersistedMessage } from "../domain/message.ts";
import type { ConciergeSession } from "../domain/session.ts";
import { conciergeMessages, conciergeSessions } from "./schema.ts";

export class DrizzleConciergeRepository implements ConciergeRepository {
  constructor(private readonly db: DbClient) {}

  async createSession(input: CreateSessionInput): Promise<ConciergeSession> {
    const rows = await this.db
      .insert(conciergeSessions)
      .values({
        tenantId: input.tenantId,
        visitorId: input.visitorId,
        page: input.page,
      })
      .returning();
    const row = rows[0];
    if (!row) {
      throw new Error("Failed to insert concierge session");
    }
    return {
      id: row.id,
      tenantId: row.tenantId,
      visitorId: row.visitorId,
      page: row.page,
      startedAt: row.startedAt,
      lastActivityAt: row.lastActivityAt,
    };
  }

  async appendMessage(input: AppendMessageInput): Promise<PersistedMessage> {
    const rows = await this.db
      .insert(conciergeMessages)
      .values({
        tenantId: input.tenantId,
        sessionId: input.sessionId,
        role: input.role,
        content: input.content,
        metadata: input.metadata ?? {},
      })
      .returning();
    await this.touchSession(input.tenantId, input.sessionId);
    const row = rows[0];
    if (!row) {
      throw new Error("Failed to insert concierge message");
    }
    return {
      id: row.id,
      sessionId: row.sessionId,
      role: row.role,
      content: row.content,
      metadata: row.metadata,
      createdAt: row.createdAt,
    };
  }

  async listMessages(tenantId: string, sessionId: string): Promise<readonly PersistedMessage[]> {
    const rows = await this.db
      .select()
      .from(conciergeMessages)
      .where(
        and(eq(conciergeMessages.tenantId, tenantId), eq(conciergeMessages.sessionId, sessionId)),
      )
      .orderBy(asc(conciergeMessages.createdAt));

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      role: row.role,
      content: row.content,
      metadata: row.metadata,
      createdAt: row.createdAt,
    }));
  }

  async touchSession(tenantId: string, sessionId: string): Promise<void> {
    await this.db
      .update(conciergeSessions)
      .set({ lastActivityAt: new Date() })
      .where(and(eq(conciergeSessions.id, sessionId), eq(conciergeSessions.tenantId, tenantId)));
  }
}
