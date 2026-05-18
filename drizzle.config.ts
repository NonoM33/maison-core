import { defineConfig } from "drizzle-kit";

const { DATABASE_URL } = process.env;
const databaseUrl = DATABASE_URL ?? "postgres://placeholder@localhost:5432/placeholder";

export default defineConfig({
  schema: "./src/features/*/infra/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
