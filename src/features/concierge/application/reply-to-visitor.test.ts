import { describe, expect, it } from "bun:test";
import type { Tenant } from "../../tenants/domain/tenant.ts";
import type { LlmCompletionRequest, LlmProvider } from "../domain/llm-provider.ts";
import { LlmProviderError } from "../domain/llm-provider.ts";
import { InMemoryConciergeRepository } from "../infra/in-memory-concierge-repository.ts";
import { ConciergeNotEnabledError, ReplyToVisitor } from "./reply-to-visitor.ts";

const fwurtz: Tenant = {
  id: "00000000-0000-0000-0000-000000000001",
  slug: "fwurtz",
  name: "Maison Fwurtz",
  status: "active",
  dbStrategy: "shared",
  themeTokens: {},
  featureFlags: {},
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

class FakeLlm implements LlmProvider {
  readonly name = "fake";
  readonly calls: LlmCompletionRequest[] = [];
  constructor(private readonly reply: string) {}
  complete(request: LlmCompletionRequest): Promise<{
    content: string;
    model: string;
    latencyMs: number;
  }> {
    this.calls.push(request);
    return Promise.resolve({ content: this.reply, model: request.model, latencyMs: 42 });
  }
}

class FailingLlm implements LlmProvider {
  readonly name = "failing";
  complete(): Promise<never> {
    return Promise.reject(new LlmProviderError("upstream down"));
  }
}

describe("ReplyToVisitor", () => {
  it("creates a session and replies in the happy path", async () => {
    const repo = new InMemoryConciergeRepository();
    const llm = new FakeLlm("Bonjour, comment puis-je vous aider ?");
    const useCase = new ReplyToVisitor({ repository: repo, llm });

    const result = await useCase.execute({
      tenant: fwurtz,
      visitorId: "visitor-1",
      page: "/",
      sessionId: null,
      content: "Bonjour",
    });

    expect(result.reply).toBe("Bonjour, comment puis-je vous aider ?");
    expect(result.metadata.fallback).toBe(false);
    expect(result.metadata.provider).toBe("fake");
    expect(result.metadata.latencyMs).toBe(42);

    const messages = await repo.listMessages(fwurtz.id, result.sessionId);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("visitor");
    expect(messages[0]?.content).toBe("Bonjour");
    expect(messages[1]?.role).toBe("concierge");
    expect(messages[1]?.content).toBe("Bonjour, comment puis-je vous aider ?");
  });

  it("passes the tenant persona as system prompt", async () => {
    const repo = new InMemoryConciergeRepository();
    const llm = new FakeLlm("Réponse");
    const useCase = new ReplyToVisitor({ repository: repo, llm });

    await useCase.execute({
      tenant: fwurtz,
      visitorId: "visitor-1",
      page: null,
      sessionId: null,
      content: "Hello",
    });

    expect(llm.calls[0]?.systemPrompt).toBe("Tu es Marie, conciergère de Maison Fwurtz.");
    expect(llm.calls[0]?.model).toBe("openai/gpt-oss-120b");
  });

  it("falls back gracefully when the LLM provider errors", async () => {
    const repo = new InMemoryConciergeRepository();
    const errors: unknown[] = [];
    const useCase = new ReplyToVisitor({
      repository: repo,
      llm: new FailingLlm(),
      fallbackMessage: "Indisponible, réessayez plus tard.",
      onLlmError: (err) => errors.push(err),
    });

    const result = await useCase.execute({
      tenant: fwurtz,
      visitorId: "visitor-1",
      page: null,
      sessionId: null,
      content: "Bonjour",
    });

    expect(result.reply).toBe("Indisponible, réessayez plus tard.");
    expect(result.metadata.fallback).toBe(true);
    expect(errors).toHaveLength(1);

    const messages = await repo.listMessages(fwurtz.id, result.sessionId);
    expect(messages[1]?.metadata.fallback).toBe(true);
  });

  it("throws ConciergeNotEnabledError when the tenant has no config", async () => {
    const useCase = new ReplyToVisitor({
      repository: new InMemoryConciergeRepository(),
      llm: new FakeLlm("nope"),
    });

    await expect(
      useCase.execute({
        tenant: tenantWithoutConcierge,
        visitorId: "visitor-1",
        page: null,
        sessionId: null,
        content: "Bonjour",
      }),
    ).rejects.toBeInstanceOf(ConciergeNotEnabledError);
  });

  it("reuses an existing session and includes its history", async () => {
    const repo = new InMemoryConciergeRepository();
    const llm = new FakeLlm("Second tour");
    const useCase = new ReplyToVisitor({ repository: repo, llm });

    const first = await useCase.execute({
      tenant: fwurtz,
      visitorId: "visitor-1",
      page: null,
      sessionId: null,
      content: "Premier message",
    });

    await useCase.execute({
      tenant: fwurtz,
      visitorId: "visitor-1",
      page: null,
      sessionId: first.sessionId,
      content: "Deuxième message",
    });

    const messages = await repo.listMessages(fwurtz.id, first.sessionId);
    expect(messages).toHaveLength(4);
    expect(messages.map((m) => m.role)).toEqual(["visitor", "concierge", "visitor", "concierge"]);
    expect(llm.calls).toHaveLength(2);
    expect(llm.calls[1]?.messages).toHaveLength(3);
  });
});
