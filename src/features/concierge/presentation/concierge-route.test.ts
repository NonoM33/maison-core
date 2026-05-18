import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import type { Tenant } from "../../tenants/domain/tenant.ts";
import { InMemoryTenantRepository } from "../../tenants/infra/in-memory-tenant-repository.ts";
import {
  type TenantContextVariables,
  tenantResolver,
} from "../../tenants/presentation/tenant-resolver.ts";
import { ReplyToVisitor } from "../application/reply-to-visitor.ts";
import type { LlmCompletionRequest, LlmProvider } from "../domain/llm-provider.ts";
import { InMemoryConciergeRepository } from "../infra/in-memory-concierge-repository.ts";
import { createConciergeRoute } from "./concierge-route.ts";

const fwurtz: Tenant = {
  id: "00000000-0000-0000-0000-000000000001",
  slug: "fwurtz",
  name: "Maison Fwurtz",
  status: "active",
  dbStrategy: "shared",
  themeTokens: {},
  featureFlags: { concierge: true },
  conciergeConfig: {
    persona: "Tu es Marie, conciergère de Maison Fwurtz.",
    provider: "groq",
    model: "openai/gpt-oss-120b",
    enabledTools: [],
  },
};

const tenantWithoutConcierge: Tenant = {
  ...fwurtz,
  id: "00000000-0000-0000-0000-000000000002",
  slug: "no-concierge",
  conciergeConfig: null,
};

class StubLlm implements LlmProvider {
  readonly name = "stub";
  constructor(private readonly reply: string) {}
  complete(request: LlmCompletionRequest): Promise<{
    content: string;
    model: string;
    latencyMs: number;
  }> {
    return Promise.resolve({ content: this.reply, model: request.model, latencyMs: 10 });
  }
}

function buildTestApp(
  tenants: readonly Tenant[],
  llmReply = "Bonjour de la concierge.",
): Hono<{ Variables: TenantContextVariables }> {
  const tenantRepo = new InMemoryTenantRepository(tenants);
  const conciergeRepo = new InMemoryConciergeRepository();
  const replyToVisitor = new ReplyToVisitor({
    repository: conciergeRepo,
    llm: new StubLlm(llmReply),
  });

  const app = new Hono<{ Variables: TenantContextVariables }>();
  app.use("/api/concierge/*", tenantResolver({ repo: tenantRepo }));
  app.route("/api/concierge", createConciergeRoute({ replyToVisitor }));
  return app;
}

describe("POST /api/concierge/chat", () => {
  it("replies in the happy path", async () => {
    const app = buildTestApp([fwurtz], "Bonjour, je suis Marie ✦");

    const res = await app.request("/api/concierge/chat", {
      method: "POST",
      headers: { host: "fwurtz.localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ visitorId: "visitor-abc", content: "Bonjour", page: "/" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { reply: string; sessionId: string };
    expect(body.reply).toBe("Bonjour, je suis Marie ✦");
    expect(body.sessionId).toMatch(/^[0-9a-f-]+$/);
  });

  it("rejects invalid payloads with 400 and zod issues", async () => {
    const app = buildTestApp([fwurtz]);

    const res = await app.request("/api/concierge/chat", {
      method: "POST",
      headers: { host: "fwurtz.localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ visitorId: "", content: "" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues: unknown[] };
    expect(body.error).toBe("invalid_payload");
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it("returns 404 when the tenant has no concierge config", async () => {
    const app = buildTestApp([tenantWithoutConcierge]);

    const res = await app.request("/api/concierge/chat", {
      method: "POST",
      headers: { host: "no-concierge.localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ visitorId: "visitor-1", content: "Bonjour" }),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      error: "concierge_not_enabled",
      tenant: "no-concierge",
    });
  });

  it("returns 404 when the host has no known tenant", async () => {
    const app = buildTestApp([fwurtz]);

    const res = await app.request("/api/concierge/chat", {
      method: "POST",
      headers: { host: "unknown.localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ visitorId: "visitor-1", content: "Bonjour" }),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "tenant_not_found" });
  });
});
