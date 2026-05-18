import { describe, expect, it } from "bun:test";
import { createApp } from "./app.ts";
import type {
  LlmCompletionRequest,
  LlmProvider,
} from "./features/concierge/domain/llm-provider.ts";
import { InMemoryConciergeRepository } from "./features/concierge/infra/in-memory-concierge-repository.ts";
import type { Tenant } from "./features/tenants/domain/tenant.ts";
import { InMemoryTenantRepository } from "./features/tenants/infra/in-memory-tenant-repository.ts";

class StubLlm implements LlmProvider {
  readonly name = "stub";
  complete(request: LlmCompletionRequest): Promise<{
    content: string;
    model: string;
    latencyMs: number;
  }> {
    return Promise.resolve({ content: "ok", model: request.model, latencyMs: 1 });
  }
}

function buildDeps(tenants: readonly Tenant[] = []) {
  return {
    tenantRepository: new InMemoryTenantRepository(tenants),
    conciergeRepository: new InMemoryConciergeRepository(),
    llm: new StubLlm(),
  } as const;
}

describe("createApp", () => {
  it("returns 200 with status ok on GET /health", async () => {
    const app = createApp(buildDeps());

    const res = await app.request("/health");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("returns 404 on unknown route", async () => {
    const app = createApp(buildDeps());

    const res = await app.request("/does-not-exist");

    expect(res.status).toBe(404);
  });
});
