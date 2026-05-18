import { createApp } from "./app.ts";
import { DrizzleConciergeRepository } from "./features/concierge/infra/drizzle-concierge-repository.ts";
import { GroqLlmProvider } from "./features/concierge/infra/groq-llm-provider.ts";
import { DrizzleTenantRepository } from "./features/tenants/infra/drizzle-tenant-repository.ts";
import { loadServerEnv } from "./shared/config/env.ts";
import { createDbClient } from "./shared/db/client.ts";

const env = loadServerEnv();
const db = createDbClient(env.DATABASE_URL);

const app = createApp({
  tenantRepository: new DrizzleTenantRepository(db),
  conciergeRepository: new DrizzleConciergeRepository(db),
  llm: new GroqLlmProvider({ apiKey: env.GROQ_API_KEY }),
  onLlmError: (error) => {
    console.warn("[concierge] LLM upstream failed:", error);
  },
});

console.log(`maison-core listening on http://localhost:${env.PORT}`);

export default {
  fetch: app.fetch,
  port: env.PORT,
};
