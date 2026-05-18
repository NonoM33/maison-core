import type { MiddlewareHandler } from "hono";
import type { TenantRepository } from "../domain/tenant-repository.ts";
import type { Tenant } from "../domain/tenant.ts";

export type TenantContextVariables = {
  tenant: Tenant;
};

export interface TenantResolverOptions {
  readonly repo: TenantRepository;
  readonly extractSlug?: (host: string) => string | null;
}

export function tenantResolver(
  options: TenantResolverOptions,
): MiddlewareHandler<{ Variables: TenantContextVariables }> {
  const extract = options.extractSlug ?? extractSlugFromSubdomain;

  return async (c, next) => {
    const host = c.req.header("host") ?? "";
    const slug = extract(host);

    if (!slug) {
      return c.json(
        { error: "tenant_not_resolved", message: "Could not extract tenant slug from host" },
        400,
      );
    }

    const tenant = await options.repo.findBySlug(slug);

    if (!tenant) {
      return c.json({ error: "tenant_not_found", slug }, 404);
    }

    if (tenant.status !== "active") {
      return c.json({ error: "tenant_inactive", slug, status: tenant.status }, 403);
    }

    c.set("tenant", tenant);
    await next();
    return;
  };
}

export function extractSlugFromSubdomain(host: string): string | null {
  const hostname = host.split(":")[0];
  if (!hostname) {
    return null;
  }
  const parts = hostname.split(".");
  if (parts.length < 2) {
    return null;
  }
  const first = parts[0];
  return first && first.length > 0 ? first : null;
}
