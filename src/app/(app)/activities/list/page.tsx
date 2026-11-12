import { redirect } from "next/navigation";
import { DRILL_DOWN_PARAM } from "@/constants/drillDown";
import { STRINGS } from "@/constants/strings";
import { ActivitiesTable } from "@/features/activities/ActivitiesTable";
import { activitiesDrillDownSeed } from "@/features/activities/drillDownFilter";
import type { SearchParams } from "@/features/stats/drillDown";
import { createContext } from "@/server/trpc/context";
import { createCaller } from "@/server/trpc/root";

export const metadata = { title: STRINGS.nav.activities };

export default async function ActivityListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<React.ReactNode> {
  const ctx = await createContext();
  if (ctx.actor === null) {
    redirect("/login");
  }
  const params = await searchParams;
  const pipelines =
    params[DRILL_DOWN_PARAM.pipeline] === undefined ? [] : await createCaller(ctx).pipeline.list();
  const seed = activitiesDrillDownSeed(params, ctx.actor.id, pipelines);
  return (
    <main aria-label="Activities" className="h-full">
      <ActivitiesTable
        key={seed === null ? "plain" : JSON.stringify(seed.filter)}
        currentUserId={ctx.actor.id}
        initialFilter={seed?.filter ?? null}
        pipelineName={seed?.pipelineName ?? null}
      />
    </main>
  );
}
