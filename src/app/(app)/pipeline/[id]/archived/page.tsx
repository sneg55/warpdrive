import type { Metadata } from "next";
import { cache } from "react";
import { STRINGS } from "@/constants/strings";
import { DealListClient } from "@/features/deals/DealListClient";
import { getPreferencesForActor } from "@/features/identity/preferencesForActor";
import { entityTitle } from "@/features/navigation/pageTitle";
import { resolveVisiblePipeline } from "@/features/navigation/resolvePipeline";
import { createContext } from "@/server/trpc/context";
import { createCaller } from "@/server/trpc/root";

// Shared per-request loader (mirrors the List page): generateMetadata and the page body both
// call this; React.cache dedupes so createContext + the visible-pipelines read run once.
const load = cache(async () => {
  const ctx = await createContext();
  if (ctx.actor === null) {
    return { kind: "unauth" as const };
  }
  const pipelines = await createCaller(ctx).pipeline.list();
  return { kind: "ok" as const, ctx, pipelines };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const loaded = await load();
  const name = loaded.kind === "ok" ? loaded.pipelines.find((p) => p.id === id)?.name : undefined;
  return { title: entityTitle(name, STRINGS.titles.dealList) };
}

// The pipeline's Archive view: the same flat list scoped to this pipeline, but showing archived
// deals (deal.list drops the open-status filter when archived:true). Each row offers Unarchive.
export default async function PipelineArchivedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  const loaded = await load();
  if (loaded.kind === "unauth") {
    return <main>Unauthorized</main>;
  }
  const { ctx, pipelines } = loaded;
  if (ctx.actor === null) return <main>Unauthorized</main>;

  // A nonexistent (or hidden) pipeline 404s like the entity detail routes, not a 200 soft-404.
  const pipeline = resolveVisiblePipeline(pipelines, id);

  const [list, prefs] = await Promise.all([
    createCaller(ctx).deal.list({
      pipelineId: id,
      offset: 0,
      limit: 50,
      archived: true,
    }),
    getPreferencesForActor(ctx.db, ctx.actor.id),
  ]);
  const stages = pipeline.stages.map((s) => ({ id: s.id, name: s.name }));
  const pipelineOptions = pipelines.map((p) => ({
    id: p.id,
    name: p.name,
    stages: p.stages.map((s) => ({ id: s.id, name: s.name })),
  }));

  return (
    <main aria-label={`Archived deals ${pipeline.name}`} className="h-full">
      <DealListClient
        variant="archived"
        initial={{
          pipelineId: id,
          rows: list.rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() })),
          total: list.total,
          totalValue: list.totalValue,
          stages,
          pipelines: pipelineOptions,
          initialColumns: prefs.ui.dealsListView,
        }}
      />
    </main>
  );
}
