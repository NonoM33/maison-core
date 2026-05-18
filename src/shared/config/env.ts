import { z } from "zod";

const baseSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
});

const serverSchema = baseSchema.extend({
  GROQ_API_KEY: z.string().min(1),
  GROQ_MODEL: z.string().default("openai/gpt-oss-120b"),
});

export type Env = z.infer<typeof baseSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

export function loadEnv(source: Record<string, string | undefined> = Bun.env): Env {
  const result = baseSchema.safeParse(source);
  if (!result.success) {
    throw new Error(formatIssues("base", result.error.issues));
  }
  return result.data;
}

export function loadServerEnv(source: Record<string, string | undefined> = Bun.env): ServerEnv {
  const result = serverSchema.safeParse(source);
  if (!result.success) {
    throw new Error(formatIssues("server", result.error.issues));
  }
  return result.data;
}

function formatIssues(scope: string, issues: readonly z.ZodIssue[]): string {
  const detail = issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
  return `Invalid ${scope} environment configuration: ${detail}`;
}
