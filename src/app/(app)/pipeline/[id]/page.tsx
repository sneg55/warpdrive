import type { Metadata } from "next";
import { cache } from "react";
import { STRINGS } from "@/constants/strings";
import { db } from "@/db/client";
import { Board } from "@/features/deals/Board";
import { getPreferencesForActor } from "@/features/identity/preferencesForActor";
import { entityTitle } from "@/features/navigation/pageTitle";
import { resolveVisiblePipeline } from "@/features/navigation/resolvePipeline";
import { readBaseCurrency } from "@/features/settings/readBaseCurrency";
import { createContext } from "@/server/trpc/context";
import { createCaller } from "@/server/trpc/root";

// Shared per-request loader: generateMetadata (for the tab title) and the page body both call
// this, but React.cache dedupes so createContext + the visible-pipelines read run once per
// request instead of twice.
const load = cache(async () => {
  const ctx = await createContext();
  if (ctx.actor === null) {
    return { kind: "unauth" as const };
  }
  const pipelines = await createCaller(ctx).pipeline.list();
  return { kind: "ok" as const, ctx, actor: ctx.actor, pipelines };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const loaded = await load();
  const name = loaded.kind === "ok" ? loaded.pipelines.find((p) => p.id === id)?.name : undefined;
  return { title: entityTitle(name, STRINGS.nav.pipeline) };
}

export default async function PipelineBoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  const ctx = await createContext();
  if (ctx.actor === null) {
    return <main>Unauthorized</main>;
  }
  const actor = ctx.actor;

  // Start the heaviest query (the board cards) up front so it runs concurrently with the
  // pipeline-list metadata read in load() instead of waiting behind it. deal.board depends only
  // on ctx + id and carries its own visibility clause, so it is safe to fire before the
  // resolveVisiblePipeline 404 guard below. The no-op catch keeps that guard's throw from
  // surfacing as an unhandled rejection on the board promise if we 404 before awaiting it; the
  // real result (and any real error) is still consumed by the Promise.all below.
  const boardPromise = createCaller(ctx).deal.board({ pipelineId: id });
  void boardPromise.catch(() => {});

  const loaded = await load();
  if (loaded.kind !== "ok") {
    return <main>Unauthorized</main>;
  }
  const { pipelines } = loaded;

  // A nonexistent (or hidden) pipeline 404s like the entity detail routes, not a 200 soft-404.
  const pipeline = resolveVisiblePipeline(pipelines, id);

  const [board, baseCurrency, prefs] = await Promise.all([
    boardPromise,
    readBaseCurrency(db, AbortSignal.timeout(8000)),
    getPreferencesForActor(db, actor.id),
  ]);

  // The board renders from a live TanStack Query cache seeded with these cards; per-stage
  // counts/totals and the drag CAS precondition are derived client-side from the live cards,
  // so no separate stageSums fetch is needed here.
  return (
    <main aria-label={`Board ${pipeline.name}`} className="h-full">
      <Board
        pipelineId={id}
        selfActorId={actor.id}
        stages={pipeline.stages.map((s) => ({
          id: s.id,
          name: s.name,
          order: s.order,
          rottingDays: s.rottingDays,
        }))}
        cards={board.cards}
        pipelines={pipelines.map((p) => ({
          id: p.id,
          name: p.name,
          stages: p.stages.map((s) => ({ id: s.id, name: s.name })),
        }))}
        density={prefs.density}
        baseCurrency={baseCurrency}
      />
    </main>
  );
}
