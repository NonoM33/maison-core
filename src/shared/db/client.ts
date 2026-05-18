import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export type DbClient = ReturnType<typeof drizzle>;

export function createDbClient(connectionString: string): DbClient {
  const queryClient = postgres(connectionString, { prepare: false });
  return drizzle(queryClient);
}
