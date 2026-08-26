import { STRINGS } from "@/constants/strings";
import { db } from "@/db/client";
import { todayInZone } from "@/features/goals/todayInZone";
import { getPreferencesForActor } from "@/features/identity/preferencesForActor";
import { can } from "@/features/permissions/can";
import { loadDashboardConfig } from "@/features/stats/stageNames";
import { Dashboard } from "@/features/stats/ui/Dashboard";
import { createContext } from "@/server/trpc/context";

export const metadata = { title: STRINGS.dashboard.title };

export default async function DashboardPage(): Promise<React.ReactNode> {
  const ctx = await createContext();
  if (ctx.actor === null) {
    return <main>Unauthorized</main>;
  }

  const canViewOthers = can(ctx.actor, "stats.viewOthers");
  const canManageGoals = can(ctx.actor, "goals.manage");
  const signal = AbortSignal.timeout(5000);
  const [{ currency, defaultPipelineId }, prefs] = await Promise.all([
    loadDashboardConfig(ctx.db, signal),
    getPreferencesForActor(db, ctx.actor.id),
  ]);
  // Resolved here, not in the browser: near UTC midnight a viewer's local date can sit on the
  // other side of a goal period boundary from everyone else looking at the same goal.
  const today = todayInZone(prefs.timezone, new Date());

  return (
    <main aria-label={STRINGS.dashboard.title}>
      <Dashboard
        canViewOthers={canViewOthers}
        canManageGoals={canManageGoals}
        today={today}
        currency={currency}
        defaultPipelineId={defaultPipelineId}
      />
    </main>
  );
}
