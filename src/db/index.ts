import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Next dev reloads modules on every edit; without caching on globalThis each
 * reload would open a fresh pool and exhaust Postgres connections within a
 * few minutes of editing.
 */
const globalForDb = globalThis as unknown as {
  __trackerSql?: ReturnType<typeof postgres>;
};

function createClient() {
  return postgres(env.databaseUrl, {
    // Serverless hosts (Vercel, Neon) hand each lambda its own pool, so a
    // large per-instance pool just burns the connection limit.
    max: env.isProduction ? 5 : 10,
    idle_timeout: 20,
    connect_timeout: 15,
  });
}

export const sql = globalForDb.__trackerSql ?? createClient();
if (!env.isProduction) globalForDb.__trackerSql = sql;

export const db = drizzle(sql, { schema });
export { schema };
