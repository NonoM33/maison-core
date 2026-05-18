import { Hono } from "hono";
import { z } from "zod";
import type { TenantContextVariables } from "../../tenants/presentation/tenant-resolver.ts";
import { ConciergeNotEnabledError, type ReplyToVisitor } from "../application/reply-to-visitor.ts";

const chatRequestSchema = z.object({
  visitorId: z.string().min(1).max(128),
  page: z.string().max(2048).nullable().optional(),
  sessionId: z.string().uuid().nullable().optional(),
  content: z.string().min(1).max(2000),
});

export interface ConciergeRouteDeps {
  readonly replyToVisitor: ReplyToVisitor;
}

export function createConciergeRoute(
  deps: ConciergeRouteDeps,
): Hono<{ Variables: TenantContextVariables }> {
  const router = new Hono<{ Variables: TenantContextVariables }>();

  router.post("/chat", async (c) => {
    const json: unknown = await c.req.json().catch(() => null);
    const parsed = chatRequestSchema.safeParse(json);

    if (!parsed.success) {
      return c.json(
        {
          error: "invalid_payload",
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        400,
      );
    }

    const tenant = c.get("tenant");

    try {
      const result = await deps.replyToVisitor.execute({
        tenant,
        visitorId: parsed.data.visitorId,
        page: parsed.data.page ?? null,
        sessionId: parsed.data.sessionId ?? null,
        content: parsed.data.content,
      });
      return c.json({
        sessionId: result.sessionId,
        reply: result.reply,
        metadata: result.metadata,
      });
    } catch (error) {
      if (error instanceof ConciergeNotEnabledError) {
        return c.json({ error: "concierge_not_enabled", tenant: tenant.slug }, 404);
      }
      throw error;
    }
  });

  return router;
}
