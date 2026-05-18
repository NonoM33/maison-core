import type { MiddlewareHandler } from "hono";
import type { TenantRepository } from "../domain/tenant-repository.ts";
import type { Tenant } from "../domain/tenant.ts";

export type TenantContextVariables = {
  tenant: Tenant;
};

export interface TenantResolverOptions {
  readonly repo: TenantRepository;
  readonly extractSlug?: (host: string) => string | null;
  /** Name of the header carrying the tenant slug. Defaults to "x-maison-tenant". */
  readonly headerName?: string;
}

const DEFAULT_HEADER_NAME = "x-maison-tenant";

/**
 * Resolves the active tenant in two passes:
 *
 *   1. **Explicit header** (`X-Maison-Tenant: <slug>`) — set automatically by `@maison/sdk`.
 *      This is the canonical way for frontend clients to talk to the platform.
 *   2. **Subdomain extraction** from `Host` — fallback for direct curl / legacy callers.
 *
 * The header always wins when both are present.
 */
export function tenantResolver(
  options: TenantResolverOptions,
): MiddlewareHandler<{ Variables: TenantContextVariables }> {
  const extract = options.extractSlug ?? extractSlugFromSubdomain;
  const headerName = options.headerName ?? DEFAULT_HEADER_NAME;

  return async (c, next) => {
    const headerSlug = sanitizeHeader(c.req.header(headerName));
    const host = c.req.header("host") ?? "";
    const slug = headerSlug ?? extract(host);

    if (!slug) {
      return c.json(
        {
          error: "tenant_not_resolved",
          message: `Could not resolve tenant — provide ${headerName} header or use a slug.* subdomain`,
        },
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

function sanitizeHeader(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) return null;
  if (!/^[a-z0-9-]{2,64}$/.test(trimmed)) return null;
  return trimmed;
}
