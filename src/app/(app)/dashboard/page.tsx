import { STRINGS } from "@/constants/strings";
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
  const { currency, defaultPipelineId } = await loadDashboardConfig(
    ctx.db,
    AbortSignal.timeout(5000),
  );

  return (
    <main aria-label={STRINGS.dashboard.title}>
      <Dashboard
        canViewOthers={canViewOthers}
        currency={currency}
        defaultPipelineId={defaultPipelineId}
      />
    </main>
  );
}
