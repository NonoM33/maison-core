import { jsonb, pgEnum, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import type { ConciergeConfig } from "../domain/concierge-config.ts";
import type { ThemeTokens } from "../domain/theme-tokens.ts";

export const tenantDbStrategy = pgEnum("tenant_db_strategy", ["shared", "dedicated"]);
export const tenantStatus = pgEnum("tenant_status", ["pending", "active", "suspended"]);

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 256 }).notNull(),
  status: tenantStatus("status").notNull().default("pending"),
  dbStrategy: tenantDbStrategy("db_strategy").notNull().default("shared"),
  dedicatedDbUrl: varchar("dedicated_db_url", { length: 512 }),
  themeTokens: jsonb("theme_tokens").$type<ThemeTokens>().notNull().default({}),
  featureFlags: jsonb("feature_flags").$type<Record<string, boolean>>().notNull().default({}),
  conciergeConfig: jsonb("concierge_config").$type<ConciergeConfig | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TenantRow = typeof tenants.$inferSelect;
export type NewTenantRow = typeof tenants.$inferInsert;
