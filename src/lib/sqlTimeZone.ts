import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { createDbCache } from "@/lib/dbCache";
import { FALLBACK_ZONE, resolveTimeZone } from "@/lib/localDayRange";

const POSTGRES_ZONES_TTL_MS = 60 * 60 * 1000;
const POSTGRES_ZONES_KEY = "postgresZones";
const postgresZonesCache = createDbCache<ReadonlySet<string>>(POSTGRES_ZONES_TTL_MS);

async function postgresZones(db: Db, signal: AbortSignal): Promise<ReadonlySet<string>> {
  const cached = postgresZonesCache.get(db, POSTGRES_ZONES_KEY);
  if (cached !== undefined) return cached;
  const result = await db.execute<{ name: string }>(
    sql`SELECT name FROM pg_timezone_names UNION SELECT abbrev FROM pg_timezone_abbrevs`,
  );
  signal.throwIfAborted();
  const zones = new Set(result.rows.map((row) => row.name.toLowerCase()));
  postgresZonesCache.set(db, POSTGRES_ZONES_KEY, zones);
  return zones;
}

export async function sqlTimeZone(
  db: Db,
  timeZone: string | null | undefined,
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted();
  const zone = resolveTimeZone(timeZone);
  const zones = await postgresZones(db, signal);
  return zones.has(zone.toLowerCase()) ? zone : FALLBACK_ZONE;
}
