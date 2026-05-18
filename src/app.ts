import { Hono } from "hono";
import { ReplyToVisitor } from "./features/concierge/application/reply-to-visitor.ts";
import type { ConciergeRepository } from "./features/concierge/domain/concierge-repository.ts";
import type { LlmProvider } from "./features/concierge/domain/llm-provider.ts";
import { createConciergeRoute } from "./features/concierge/presentation/concierge-route.ts";
import type { TenantRepository } from "./features/tenants/domain/tenant-repository.ts";
import {
  type TenantContextVariables,
  tenantResolver,
} from "./features/tenants/presentation/tenant-resolver.ts";

export interface AppDependencies {
  readonly tenantRepository: TenantRepository;
  readonly conciergeRepository: ConciergeRepository;
  readonly llm: LlmProvider;
  readonly onLlmError?: (error: unknown) => void;
}

export function createApp(deps: AppDependencies): Hono<{ Variables: TenantContextVariables }> {
  const replyToVisitor = new ReplyToVisitor({
    repository: deps.conciergeRepository,
    llm: deps.llm,
    ...(deps.onLlmError && { onLlmError: deps.onLlmError }),
  });

  const app = new Hono<{ Variables: TenantContextVariables }>();

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.use("/api/concierge/*", tenantResolver({ repo: deps.tenantRepository }));
  app.route("/api/concierge", createConciergeRoute({ replyToVisitor }));

  return app;
}
