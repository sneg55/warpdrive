import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/config/env";
import * as schema from "./schema";

// Shared pool for the Next app, WS server, and worker (same Drizzle layer).
export const pool = new Pool({ connectionString: env.DATABASE_URL });
export const db = drizzle(pool, { schema });

// Use the base NodePgDatabase type (without $client: Pool) so both the
// production db and the test db (plain NodePgDatabase) satisfy Db.
export type Db = NodePgDatabase<typeof schema>;
