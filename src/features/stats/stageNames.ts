import { eq } from "drizzle-orm";
import { env } from "@/config/env";
import type { Db } from "@/db/client";
import { settings } from "@/db/schema";

export async function loadDashboardConfig(
  db: Db,
  signal: AbortSignal,
): Promise<{ currency: string; defaultPipelineId: string | null }> {
  signal.throwIfAborted();
  const [s] = await db.select().from(settings).where(eq(settings.id, true));
  const currency = s?.baseCurrency ?? env.BASE_CURRENCY;
  const defaultPipelineId = s?.defaultPipelineId ?? null;
  return { currency, defaultPipelineId };
}
