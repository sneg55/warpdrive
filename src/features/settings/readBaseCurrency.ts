import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { settings } from "@/db/schema/system";
import { createDbCache } from "@/lib/dbCache";

// baseCurrency changes at most when an admin edits company settings (rare), yet it is read on every
// board, leads, and deal render. Cache it per Db instance so those renders stop re-reading the
// settings singleton; updateSettings invalidates, and the short TTL self-heals a missed invalidation.
const currencyCache = createDbCache<string>(10_000);
const CURRENCY_KEY = "base";

export function invalidateBaseCurrencyCache(db: Db): void {
  currencyCache.invalidate(db);
}

// The instance base currency from the settings singleton, with a USD fallback when the row is
// absent (fresh install). Pages that render money labels read this to seed their currency prefix.
export async function readBaseCurrency(db: Db, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  const cached = currencyCache.get(db, CURRENCY_KEY);
  if (cached !== undefined) return cached;
  const [row] = await db
    .select({ baseCurrency: settings.baseCurrency })
    .from(settings)
    .where(eq(settings.id, true));
  const value = row?.baseCurrency ?? "USD";
  currencyCache.set(db, CURRENCY_KEY, value);
  return value;
}
