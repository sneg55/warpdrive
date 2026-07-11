import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { settings } from "@/db/schema/system";

// The instance base currency from the settings singleton, with a USD fallback when the row is
// absent (fresh install). Pages that render money labels read this to seed their currency prefix.
export async function readBaseCurrency(db: Db, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  const [row] = await db
    .select({ baseCurrency: settings.baseCurrency })
    .from(settings)
    .where(eq(settings.id, true));
  return row?.baseCurrency ?? "USD";
}
