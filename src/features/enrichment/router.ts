// Enrichment reads. `status` gates the record button: an install that has configured nothing
// shows the section header exactly as it did before this feature existed.
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "@/server/trpc/trpc";
import { getCacheTtlDays, listMappings } from "./mappingsRepo";
import { listProviders, type ProviderView } from "./providersRepo";
import type { ResolvedMapping } from "./types";

const SIG = (): AbortSignal => AbortSignal.timeout(10_000);

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
});
