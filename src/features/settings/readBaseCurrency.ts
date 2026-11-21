import { eq } from "drizzle-orm";
import { env } from "@/config/env";
import type { Db } from "@/db/client";
import { settings } from "@/db/schema/system";
import { createDbCache } from "@/lib/dbCache";

const currencyCache = createDbCache<string>(10_000);
const CURRENCY_KEY = "base";

export function invalidateBaseCurrencyCache(db: Db): void {
  currencyCache.invalidate(db);
}

export async function readBaseCurrency(db: Db, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  const cached = currencyCache.get(db, CURRENCY_KEY);
  if (cached !== undefined) return cached;
  const [row] = await db
    .select({ baseCurrency: settings.baseCurrency })
    .from(settings)
    .where(eq(settings.id, true));
  const value = row?.baseCurrency ?? env.BASE_CURRENCY;
  currencyCache.set(db, CURRENCY_KEY, value);
  return value;
}
