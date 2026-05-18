import type { Tenant } from "../../tenants/domain/tenant.ts";
import type { ConciergeRepository } from "../domain/concierge-repository.ts";
import {
  type LlmCompletionResponse,
  type LlmProvider,
  LlmProviderError,
} from "../domain/llm-provider.ts";
import type { MessageMetadata } from "../domain/message.ts";

export class ConciergeNotEnabledError extends Error {
  constructor(readonly tenantSlug: string) {
    super(`Concierge is not enabled for tenant '${tenantSlug}'`);
    this.name = "ConciergeNotEnabledError";
  }
}

export interface ReplyToVisitorInput {
  readonly tenant: Tenant;
  readonly visitorId: string;
  readonly page: string | null;
  readonly sessionId: string | null;
  readonly content: string;
}

export interface ReplyToVisitorOutput {
  readonly sessionId: string;
  readonly reply: string;
  readonly metadata: MessageMetadata;
}

export interface ReplyToVisitorDeps {
  readonly repository: ConciergeRepository;
  readonly llm: LlmProvider;
  readonly historyLimit?: number;
  readonly fallbackMessage?: string;
  readonly onLlmError?: (error: unknown) => void;
}

const DEFAULT_HISTORY_LIMIT = 16;
const DEFAULT_FALLBACK =
  "Désolé, je suis momentanément indisponible. N'hésitez pas à revenir vers moi dans quelques instants.";

export class ReplyToVisitor {
  private readonly historyLimit: number;
  private readonly fallbackMessage: string;
  private readonly onLlmError: (error: unknown) => void;

  constructor(private readonly deps: ReplyToVisitorDeps) {
    this.historyLimit = deps.historyLimit ?? DEFAULT_HISTORY_LIMIT;
    this.fallbackMessage = deps.fallbackMessage ?? DEFAULT_FALLBACK;
    this.onLlmError = deps.onLlmError ?? (() => undefined);
  }

  async execute(input: ReplyToVisitorInput): Promise<ReplyToVisitorOutput> {
    const config = input.tenant.conciergeConfig;
    if (!config) {
      throw new ConciergeNotEnabledError(input.tenant.slug);
    }

    const sessionId = await this.ensureSession(input);

    await this.deps.repository.appendMessage({
      tenantId: input.tenant.id,
      sessionId,
      role: "visitor",
      content: input.content,
    });

    const history = await this.deps.repository.listMessages(input.tenant.id, sessionId);
    const truncated = history.slice(-this.historyLimit);

    let reply: string;
    let metadata: MessageMetadata;

    try {
      const completion = await this.deps.llm.complete({
        systemPrompt: config.persona,
        messages: truncated.map(({ role, content }) => ({ role, content })),
        model: config.model,
        ...(config.temperature !== undefined && { temperature: config.temperature }),
      });
      reply = completion.content;
      metadata = this.buildSuccessMetadata(completion);
    } catch (error) {
      this.onLlmError(error);
      reply = this.fallbackMessage;
      metadata = {
        provider: this.deps.llm.name,
        model: config.model,
        fallback: true,
      };
      if (!(error instanceof LlmProviderError)) {
        throw error;
      }
    }

    await this.deps.repository.appendMessage({
      tenantId: input.tenant.id,
      sessionId,
      role: "concierge",
      content: reply,
      metadata,
    });

    return { sessionId, reply, metadata };
  }

  private async ensureSession(input: ReplyToVisitorInput): Promise<string> {
    if (input.sessionId) {
      await this.deps.repository.touchSession(input.tenant.id, input.sessionId);
      return input.sessionId;
    }
    const session = await this.deps.repository.createSession({
      tenantId: input.tenant.id,
      visitorId: input.visitorId,
      page: input.page,
    });
    return session.id;
  }

  private buildSuccessMetadata(completion: LlmCompletionResponse): MessageMetadata {
    return {
      provider: this.deps.llm.name,
      model: completion.model,
      latencyMs: completion.latencyMs,
      fallback: false,
      ...(completion.tokenUsage && { tokenUsage: completion.tokenUsage }),
    };
  }
}
