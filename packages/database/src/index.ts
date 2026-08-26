import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import * as schema from "./schema.js";

export type AtlasDatabase = ReturnType<typeof createDatabase>["db"];

export function createDatabase(config: PoolConfig | string) {
  const pool = new Pool(
    typeof config === "string" ? { connectionString: config } : config,
  );
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export * from "./schema.js";
