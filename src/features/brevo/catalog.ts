import { sql } from "drizzle-orm";
import { BREVO_CATALOG_MAX_PAGES, BREVO_CATALOG_PAGE_SIZE } from "@/constants/brevo";
import { type AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { brevoCampaigns } from "@/db/schema";
import { err, ok, type Result } from "@/types/result";
import type { BrevoCampaignInfo, BrevoClient } from "./types";

export interface CatalogDeps {
  db: Db;
  client: BrevoClient;
  pageSize?: number;
}

async function upsertCampaigns(db: Db, campaigns: BrevoCampaignInfo[]): Promise<void> {
  if (campaigns.length === 0) return;
  await db
    .insert(brevoCampaigns)
    .values(campaigns)
    .onConflictDoUpdate({
      target: brevoCampaigns.id,
      set: {
        name: sql`excluded.name`,
        subject: sql`excluded.subject`,
        status: sql`excluded.status`,
        sentAt: sql`excluded.sent_at`,
        updatedAt: sql`now()`,
      },
    });
}

export async function syncCatalog(
  deps: CatalogDeps,
  signal: AbortSignal,
): Promise<Result<{ pages: number }, AppError>> {
  const limit = deps.pageSize ?? BREVO_CATALOG_PAGE_SIZE;
  let pages = 0;
  for (let offset = 0; pages < BREVO_CATALOG_MAX_PAGES; offset += limit) {
    signal.throwIfAborted();
    const page = await deps.client.listCampaigns({ limit, offset }, signal);
    if (!page.ok) {
      if (page.error.id === ERROR_IDS.BREVO_UNAUTHORIZED) return err(page.error);
      console.warn("brevo catalog page failed", { id: page.error.id, offset });
      return ok({ pages });
    }
    await upsertCampaigns(deps.db, page.value.campaigns);
    pages += 1;
    if (page.value.campaigns.length === 0 || offset + limit >= page.value.count) break;
  }
  return ok({ pages });
}
