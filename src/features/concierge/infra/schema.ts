import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "../../tenants/infra/schema.ts";
import type { MessageMetadata } from "../domain/message.ts";

export const conciergeMessageRole = pgEnum("concierge_message_role", [
  "visitor",
  "concierge",
  "system",
]);

export const conciergeSessions = pgTable("concierge_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  visitorId: text("visitor_id").notNull(),
  page: text("page"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conciergeMessages = pgTable("concierge_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => conciergeSessions.id, { onDelete: "cascade" }),
  role: conciergeMessageRole("role").notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata").$type<MessageMetadata>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ConciergeSessionRow = typeof conciergeSessions.$inferSelect;
export type NewConciergeSessionRow = typeof conciergeSessions.$inferInsert;
export type ConciergeMessageRow = typeof conciergeMessages.$inferSelect;
export type NewConciergeMessageRow = typeof conciergeMessages.$inferInsert;
