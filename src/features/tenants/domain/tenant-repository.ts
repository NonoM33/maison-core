import type { Tenant } from "./tenant.ts";

export interface TenantRepository {
  findBySlug(slug: string): Promise<Tenant | null>;
  findById(id: string): Promise<Tenant | null>;
}
