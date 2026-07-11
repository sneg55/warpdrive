// Convenience wrapper: spin up a test DB, run the callback, tear down.
// Use this for integration tests that need an isolated real Postgres instance.
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@/db/schema";
import { makeTestDb } from "@/test/db";

type Db = NodePgDatabase<typeof schema>;

export async function withTestDb(fn: (db: Db) => Promise<void>): Promise<void> {
  const h = await makeTestDb();
  try {
    await fn(h.db);
  } finally {
    await h.close();
  }
}
