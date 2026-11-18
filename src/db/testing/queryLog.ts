import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";
import { makeTestDb } from "@/test/db";

type Db = NodePgDatabase<typeof schema>;

export async function withLoggedTestDb(
  fn: (db: Db, queryParams: unknown[][], queries: string[]) => Promise<void>,
): Promise<void> {
  const h = await makeTestDb();
  const queryParams: unknown[][] = [];
  const queries: string[] = [];
  const db = drizzle(h.pool, {
    schema,
    logger: {
      logQuery: (query, params) => {
        queries.push(query);
        queryParams.push(params);
      },
    },
  });
  try {
    await fn(db, queryParams, queries);
  } finally {
    await h.close();
  }
}
