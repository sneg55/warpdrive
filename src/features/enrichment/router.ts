// Enrichment reads. `status` gates the record button: an install that has configured nothing
// shows the section header exactly as it did before this feature existed.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  PROSPECT_SEARCH_MAX_PAGE,
  PROSPECT_SEARCH_MAX_TITLES,
  PROSPECT_SENIORITIES,
} from "@/constants/prospectSearch";
import { toContactActor } from "@/features/contacts/actorAdapters";
import { protectedProcedure, router } from "@/server/trpc/trpc";
import { unwrap } from "@/server/unwrap";
import { getCacheTtlDays, listMappings } from "./mappingsRepo";
import { findResumableBatch } from "./prospectsRepo";
import { providerFor } from "./providers/registry";
import { ENRICHMENT_PROVIDER_IDS, type ProviderId } from "./providers/types";
import { listProviders, listUsableProviders, type ProviderView } from "./providersRepo";
import { loadRevealBatch } from "./revealBatchQuery";
import type { RevealBatch } from "./revealTypes";
import { searchCapableProviders } from "./searchProviders";
import { type ProspectSearchView, searchProspects } from "./searchService";
import type { ResolvedMapping } from "./types";

const SIG = (): AbortSignal => AbortSignal.timeout(10_000);

const SEARCH_SIG = (): AbortSignal => AbortSignal.timeout(30_000);

const searchInput = z.object({
  orgId: z.string().uuid(),
  provider: z.enum(ENRICHMENT_PROVIDER_IDS),
  titles: z.array(z.string().trim().min(1)).max(PROSPECT_SEARCH_MAX_TITLES).default([]),
  seniorities: z.array(z.enum(PROSPECT_SENIORITIES)).default([]),
  page: z.number().int().min(1).max(PROSPECT_SEARCH_MAX_PAGE).default(1),
});

export interface EnrichmentStatus {
  ready: boolean;
  providers: { provider: string; enabled: boolean; throttledUntilIso: string | null }[];
}

export interface EnrichmentConfig {
  providers: ProviderView[];
  personMappings: ResolvedMapping[];
  orgMappings: ResolvedMapping[];
  cacheTtlDays: number;
}

export const enrichmentRouter = router({
  // Deliberately not admin-gated: every user who can edit a record needs to know whether the
  // button should render, and this exposes no key material.
  status: protectedProcedure.query(async ({ ctx }): Promise<EnrichmentStatus> => {
    const rows = await listProviders(ctx.db, SIG());
    return {
      ready: rows.some((p) => p.enabled && p.hasKey),
      providers: rows.map((p) => ({
        provider: p.provider,
        enabled: p.enabled,
        throttledUntilIso: p.throttledUntil?.toISOString() ?? null,
      })),
    };
  }),

  // The settings page. Admin-only because the mapping and the credential state are company
  // configuration, not something a regular user has any business reading.
  config: protectedProcedure.query(async ({ ctx }): Promise<EnrichmentConfig> => {
    if (ctx.actor.type !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "admin required" });
    }
    const signal = SIG();
    return {
      providers: await listProviders(ctx.db, signal),
      personMappings: await listMappings(ctx.db, "person", signal),
      orgMappings: await listMappings(ctx.db, "organization", signal),
      cacheTtlDays: await getCacheTtlDays(ctx.db, signal),
    };
  }),

  searchPeople: protectedProcedure
    .input(searchInput)
    .query(({ ctx, input }): Promise<ProspectSearchView> => {
      return unwrap(
        searchProspects(
          ctx.db,
          toContactActor(ctx.actor),
          {
            orgId: input.orgId,
            provider: input.provider,
            titles: input.titles,
            seniorities: [...input.seniorities],
            page: input.page,
          },
          new Date(),
          SEARCH_SIG(),
        ),
      );
    }),

  searchProviders: protectedProcedure.query(async ({ ctx }): Promise<ProviderId[]> => {
    const usable = await listUsableProviders(ctx.db, new Date(), SIG());
    return searchCapableProviders(usable, providerFor);
  }),

  resumableBatch: protectedProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      findResumableBatch(ctx.db, input.orgId, ctx.actor.id, new Date(), SIG()),
    ),

  revealBatch: protectedProcedure
    .input(z.object({ orgId: z.string().uuid(), batchId: z.string().uuid() }))
    .query(
      ({ ctx, input }): Promise<RevealBatch> =>
        loadRevealBatch(
          ctx.db,
          toContactActor(ctx.actor),
          { orgId: input.orgId, batchId: input.batchId },
          SIG(),
        ),
    ),
});
