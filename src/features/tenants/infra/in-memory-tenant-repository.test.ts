import { describe, expect, it } from "bun:test";
import type { Tenant } from "../domain/tenant.ts";
import { InMemoryTenantRepository } from "./in-memory-tenant-repository.ts";

const fwurtz: Tenant = {
  id: "00000000-0000-0000-0000-000000000001",
  slug: "fwurtz",
  name: "Maison Fwurtz",
  status: "active",
  dbStrategy: "shared",
  themeTokens: {},
  featureFlags: { concierge: true },
  conciergeConfig: null,
};

describe("InMemoryTenantRepository", () => {
  it("returns the tenant matching the slug", async () => {
    const repo = new InMemoryTenantRepository([fwurtz]);

    const found = await repo.findBySlug("fwurtz");

    expect(found).toEqual(fwurtz);
  });

  it("returns null when no tenant matches the slug", async () => {
    const repo = new InMemoryTenantRepository([fwurtz]);

    const found = await repo.findBySlug("unknown");

    expect(found).toBeNull();
  });

  it("returns the tenant matching the id", async () => {
    const repo = new InMemoryTenantRepository([fwurtz]);

    const found = await repo.findById(fwurtz.id);

    expect(found).toEqual(fwurtz);
  });

  it("returns null when no tenant matches the id", async () => {
    const repo = new InMemoryTenantRepository([fwurtz]);

    const found = await repo.findById("00000000-0000-0000-0000-000000000999");

    expect(found).toBeNull();
  });

  it("returns an empty repository's queries as null", async () => {
    const repo = new InMemoryTenantRepository();

    expect(await repo.findBySlug("anything")).toBeNull();
    expect(await repo.findById("00000000-0000-0000-0000-000000000001")).toBeNull();
  });
});
