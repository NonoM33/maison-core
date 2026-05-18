import { defineConfig } from "drizzle-kit";
import { loadEnv } from "./src/shared/config/env.ts";

const env = loadEnv();

export default defineConfig({
  schema: "./src/features/*/infra/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  strict: true,
  verbose: true,
});
