import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { settings } from "@/db/schema";

// Reads dashboard-wide config from the settings singleton: the company base
// currency and the default pipeline id (used as the initial dashboard selection).
// Stage NAMES are no longer resolved here: stageSums returns each row's name
// directly (see F5-4), so the dashboard no longer depends on a default-pipeline
// name map that broke when viewing any other pipeline.
export async function loadDashboardConfig(
  db: Db,
  signal: AbortSignal,
): Promise<{ currency: string; defaultPipelineId: string | null }> {
  signal.throwIfAborted();
  const [s] = await db.select().from(settings).where(eq(settings.id, true));
  const currency = s?.baseCurrency ?? "USD";
  const defaultPipelineId = s?.defaultPipelineId ?? null;
  return { currency, defaultPipelineId };
}
