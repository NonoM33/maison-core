import type { TenantRepository } from "../domain/tenant-repository.ts";
import type { Tenant } from "../domain/tenant.ts";

export class InMemoryTenantRepository implements TenantRepository {
  private readonly tenants: Map<string, Tenant>;

  constructor(seed: readonly Tenant[] = []) {
    this.tenants = new Map(seed.map((tenant) => [tenant.id, tenant]));
  }

  findBySlug(slug: string): Promise<Tenant | null> {
    for (const tenant of this.tenants.values()) {
      if (tenant.slug === slug) {
        return Promise.resolve(tenant);
      }
    }
    return Promise.resolve(null);
  }

  findById(id: string): Promise<Tenant | null> {
    return Promise.resolve(this.tenants.get(id) ?? null);
  }
}
