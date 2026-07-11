import type { Metadata } from "next";
import { cache } from "react";
import { STRINGS } from "@/constants/strings";
import { DealListClient } from "@/features/deals/DealListClient";
import { getPreferencesForActor } from "@/features/identity/preferencesForActor";
import { entityTitle } from "@/features/navigation/pageTitle";
import { resolveVisiblePipeline } from "@/features/navigation/resolvePipeline";
import { createContext } from "@/server/trpc/context";
import { createCaller } from "@/server/trpc/root";

// Shared per-request loader: generateMetadata (for the tab title) and the page body both call
// this; React.cache dedupes so createContext + the visible-pipelines read run once per request.
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

// The pipeline's List view. Same section as the board (/pipeline/[id]); Pipedrive treats
// Board and List as two views of one Deals section, so the flat list is scoped to this pipeline.
export default async function PipelineListPage({
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

  const list = await createCaller(ctx).deal.list({ pipelineId: id, offset: 0, limit: 50 });
  const prefs = await getPreferencesForActor(ctx.db, ctx.actor.id);
  const stages = pipeline.stages.map((s) => ({ id: s.id, name: s.name }));
  const pipelineOptions = pipelines.map((p) => ({
    id: p.id,
    name: p.name,
    stages: p.stages.map((s) => ({ id: s.id, name: s.name })),
  }));

  return (
    <main aria-label={`Deals ${pipeline.name}`} className="h-full">
      <DealListClient
        variant="list"
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
