import { eq } from "drizzle-orm";
import type { DbClient } from "../../../shared/db/client.ts";
import type { TenantRepository } from "../domain/tenant-repository.ts";
import type { Tenant } from "../domain/tenant.ts";
import { type TenantRow, tenants } from "./schema.ts";

export class DrizzleTenantRepository implements TenantRepository {
  constructor(private readonly db: DbClient) {}

  async findBySlug(slug: string): Promise<Tenant | null> {
    const rows = await this.db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
    const row = rows[0];
    return row ? this.toDomain(row) : null;
  }

  async findById(id: string): Promise<Tenant | null> {
    const rows = await this.db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
    const row = rows[0];
    return row ? this.toDomain(row) : null;
  }

  private toDomain(row: TenantRow): Tenant {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      status: row.status,
      dbStrategy: row.dbStrategy,
      themeTokens: row.themeTokens,
      featureFlags: row.featureFlags,
      conciergeConfig: row.conciergeConfig,
    };
  }
}
