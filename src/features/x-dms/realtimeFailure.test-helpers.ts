import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";

export async function breakRealtimePublish(db: Db): Promise<void> {
  await db.execute(sql`CREATE OR REPLACE FUNCTION test_refuse_channel_version() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'realtime publish refused'; END $$`);
  await db.execute(sql`CREATE TRIGGER test_refuse_channel_version
    BEFORE INSERT OR UPDATE ON channel_versions
    FOR EACH ROW EXECUTE FUNCTION test_refuse_channel_version()`);
}

export async function restoreRealtimePublish(db: Db): Promise<void> {
  await db.execute(sql`DROP TRIGGER test_refuse_channel_version ON channel_versions`);
}
