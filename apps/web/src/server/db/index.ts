import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { isCloudflareRuntime } from "@/server/runtime";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;
type PgClient = ReturnType<typeof postgres>;

const globalForDb = globalThis as unknown as {
  pgClient?: PgClient;
  drizzleDb?: Database;
};

function connectionString() {
  return (
    process.env.DATABASE_URL ??
    "postgresql://webagent:webagent@localhost:5432/webagent"
  );
}

export function isDbConfigured(): boolean {
  return process.env.DATABASE_DISABLED !== "true";
}

function createClient(): PgClient {
  // Workers: avoid pooling across requests; Hyperdrive recommended for prod DB.
  const max = isCloudflareRuntime() ? 1 : 10;
  return postgres(connectionString(), {
    max,
    prepare: false,
  });
}

export function getClient(): PgClient {
  if (!isDbConfigured()) {
    throw new Error("Database is disabled (DATABASE_DISABLED=true)");
  }
  if (isCloudflareRuntime()) {
    // Per OpenNext troubleshooting: do not reuse sockets across requests.
    return createClient();
  }
  if (!globalForDb.pgClient) {
    globalForDb.pgClient = createClient();
  }
  return globalForDb.pgClient;
}

export function getDb(): Database {
  if (isCloudflareRuntime()) {
    return drizzle(getClient(), { schema });
  }
  if (!globalForDb.drizzleDb) {
    globalForDb.drizzleDb = drizzle(getClient(), { schema });
  }
  return globalForDb.drizzleDb;
}

/** @deprecated Prefer getDb() — kept for existing imports; lazy on first use. */
export const db = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

/** @deprecated Prefer getClient() — lazy tagged-template proxy. */
export const client = new Proxy(function () {} as unknown as PgClient, {
  apply(_target, _thisArg, argArray) {
    const real = getClient();
    return Reflect.apply(real as unknown as (...a: unknown[]) => unknown, real, argArray);
  },
  get(_target, prop, receiver) {
    if (prop === "then") return undefined;
    const real = getClient();
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
