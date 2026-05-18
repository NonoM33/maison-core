/**
 * Inserts or updates a tenant from a JSON config file.
 *
 * Usage:
 *   bun scripts/seed-tenant.ts ./scripts/templates/tenant.example.json
 *
 * The config file shape is enforced by `tenantConfigSchema`. Idempotent:
 * if a tenant with the same slug exists, its config is updated.
 */
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { ConciergeConfig } from "../src/features/tenants/domain/concierge-config.ts";
import { tenants } from "../src/features/tenants/infra/schema.ts";
import { loadEnv } from "../src/shared/config/env.ts";
import { createDbClient } from "../src/shared/db/client.ts";

const conciergeConfigSchema = z.object({
  persona: z.string().min(10),
  provider: z.enum(["groq", "anthropic", "openai"]),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2).optional(),
  enabledTools: z.array(z.string()).default([]),
  forbiddenTopics: z.array(z.string()).optional(),
});

const tenantConfigSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase, digits, dashes only"),
  name: z.string().min(1).max(256),
  status: z.enum(["pending", "active", "suspended"]).default("active"),
  dbStrategy: z.enum(["shared", "dedicated"]).default("shared"),
  dedicatedDbUrl: z.string().url().nullable().optional(),
  featureFlags: z.record(z.boolean()).default({}),
  themeTokens: z.record(z.unknown()).default({}),
  conciergeConfig: conciergeConfigSchema.nullable().default(null),
});

async function main(): Promise<void> {
  const configPath = process.argv[2];
  if (!configPath) {
    console.error("Usage: bun scripts/seed-tenant.ts <path-to-tenant-config.json>");
    process.exit(1);
  }

  const raw = await readFile(configPath, "utf-8");
  const parsed = tenantConfigSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    console.error("[seed] config validation failed:", parsed.error.format());
    process.exit(1);
  }
  const config = parsed.data;

  const env = loadEnv();
  const db = createDbClient(env.DATABASE_URL);

  const conciergeConfig = normalizeConciergeConfig(config.conciergeConfig);

  const existing = await db.select().from(tenants).where(eq(tenants.slug, config.slug)).limit(1);

  if (existing[0]) {
    console.log(`[seed] tenant '${config.slug}' exists — updating`);
    await db
      .update(tenants)
      .set({
        name: config.name,
        status: config.status,
        dbStrategy: config.dbStrategy,
        dedicatedDbUrl: config.dedicatedDbUrl ?? null,
        themeTokens: config.themeTokens,
        featureFlags: config.featureFlags,
        conciergeConfig,
        updatedAt: new Date(),
      })
      .where(eq(tenants.slug, config.slug));
  } else {
    console.log(`[seed] tenant '${config.slug}' does not exist — inserting`);
    await db.insert(tenants).values({
      slug: config.slug,
      name: config.name,
      status: config.status,
      dbStrategy: config.dbStrategy,
      dedicatedDbUrl: config.dedicatedDbUrl ?? null,
      themeTokens: config.themeTokens,
      featureFlags: config.featureFlags,
      conciergeConfig,
    });
  }

  console.log(`[seed] ✓ tenant '${config.slug}' is up to date`);
}

type ParsedConciergeConfig = z.infer<typeof conciergeConfigSchema>;

function normalizeConciergeConfig(raw: ParsedConciergeConfig | null): ConciergeConfig | null {
  if (!raw) {
    return null;
  }
  return {
    persona: raw.persona,
    provider: raw.provider,
    model: raw.model,
    enabledTools: raw.enabledTools,
    ...(raw.temperature !== undefined && { temperature: raw.temperature }),
    ...(raw.forbiddenTopics !== undefined && { forbiddenTopics: raw.forbiddenTopics }),
  };
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("[seed] failed:", err);
    process.exit(1);
  });
