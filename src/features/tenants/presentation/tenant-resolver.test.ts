import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import type { Tenant } from "../domain/tenant.ts";
import { InMemoryTenantRepository } from "../infra/in-memory-tenant-repository.ts";
import {
  type TenantContextVariables,
  extractSlugFromSubdomain,
  tenantResolver,
} from "./tenant-resolver.ts";

const fwurtz: Tenant = {
  id: "00000000-0000-0000-0000-000000000001",
  slug: "fwurtz",
  name: "Maison Fwurtz",
  status: "active",
  dbStrategy: "shared",
  themeTokens: {},
  featureFlags: {},
  conciergeConfig: null,
};

const suspendedTenant: Tenant = {
  ...fwurtz,
  id: "00000000-0000-0000-0000-000000000002",
  slug: "suspended-co",
  status: "suspended",
};

function buildApp(repo: InMemoryTenantRepository): Hono<{ Variables: TenantContextVariables }> {
  const app = new Hono<{ Variables: TenantContextVariables }>();
  app.use("*", tenantResolver({ repo }));
  app.get("/whoami", (c) => c.json({ slug: c.get("tenant").slug, name: c.get("tenant").name }));
  return app;
}

describe("extractSlugFromSubdomain", () => {
  it.each([
    ["fwurtz.localhost:3000", "fwurtz"],
    ["fwurtz.lvh.me", "fwurtz"],
    ["fwurtz.maison.fr", "fwurtz"],
    ["staging-fwurtz.maison.fr", "staging-fwurtz"],
  ])("extracts %s -> %s", (host, expected) => {
    expect(extractSlugFromSubdomain(host)).toBe(expected);
  });

  it.each([["localhost"], ["localhost:3000"], [""], [":3000"]])("returns null for %s", (host) => {
    expect(extractSlugFromSubdomain(host)).toBeNull();
  });
});

describe("tenantResolver middleware", () => {
  it("resolves the tenant from the Host header and exposes it via c.get", async () => {
    const repo = new InMemoryTenantRepository([fwurtz]);
    const app = buildApp(repo);

    const res = await app.request("/whoami", { headers: { host: "fwurtz.localhost:3000" } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ slug: "fwurtz", name: "Maison Fwurtz" });
  });

  it("returns 400 when no subdomain is present", async () => {
    const repo = new InMemoryTenantRepository([fwurtz]);
    const app = buildApp(repo);

    const res = await app.request("/whoami", { headers: { host: "localhost:3000" } });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "tenant_not_resolved" });
  });

  it("returns 404 when the tenant slug does not exist", async () => {
    const repo = new InMemoryTenantRepository([fwurtz]);
    const app = buildApp(repo);

    const res = await app.request("/whoami", { headers: { host: "unknown.localhost:3000" } });

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "tenant_not_found", slug: "unknown" });
  });

  it("returns 403 when the tenant is suspended", async () => {
    const repo = new InMemoryTenantRepository([fwurtz, suspendedTenant]);
    const app = buildApp(repo);

    const res = await app.request("/whoami", {
      headers: { host: "suspended-co.localhost:3000" },
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "tenant_inactive", status: "suspended" });
  });
});
