import type { Metadata } from "next";
import { cache } from "react";
import { STRINGS } from "@/constants/strings";
import { db } from "@/db/client";
import { Board } from "@/features/deals/Board";
import { boardViewDefinition } from "@/features/deals/boardView";
import { resolveInitialBoardView } from "@/features/deals/initialBoardView";
import { rowToView } from "@/features/deals/savedFilterView";
import { getPreferencesForActor } from "@/features/identity/preferencesForActor";
import { entityTitle } from "@/features/navigation/pageTitle";
import { resolveVisiblePipeline } from "@/features/navigation/resolvePipeline";
import { canManagePipelines } from "@/features/pipelines/canManagePipelines";
import { readBaseCurrency } from "@/features/settings/readBaseCurrency";
import { createContext } from "@/server/trpc/context";
import { createCaller } from "@/server/trpc/root";

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

  const prefsPromise = getPreferencesForActor(db, actor.id);
  const viewPromise = prefsPromise.then((p) =>
    resolveInitialBoardView(p.ui, async () =>
      (await createCaller(ctx).deal.savedFilters()).map(rowToView),
    ),
  );
  void viewPromise.catch(() => {});
  const boardPromise = viewPromise.then((view) =>
    createCaller(ctx).deal.board({ pipelineId: id, definition: boardViewDefinition(view) }),
  );
  void boardPromise.catch(() => {});

  const loaded = await load();
  if (loaded.kind !== "ok") {
    return <main>Unauthorized</main>;
  }
  const { pipelines } = loaded;

  const pipeline = resolveVisiblePipeline(pipelines, id);

  const [board, baseCurrency, prefs, initialView] = await Promise.all([
    boardPromise,
    readBaseCurrency(db, AbortSignal.timeout(8000)),
    prefsPromise,
    viewPromise,
  ]);

  return (
    <main aria-label={`Board ${pipeline.name}`} className="h-full">
      <Board
        pipelineId={id}
        serverNow={new Date()}
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
        initialView={initialView}
        canManagePipelines={canManagePipelines(actor)}
      />
    </main>
  );
}
