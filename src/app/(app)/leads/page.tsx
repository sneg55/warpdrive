import { STRINGS } from "@/constants/strings";
import { db } from "@/db/client";
import { listDefs } from "@/features/custom-fields/defsRepo";
import { getPreferencesForActor } from "@/features/identity/preferencesForActor";
import { toLeadSort } from "@/features/leads/inbox/seedSort";
import { LeadsInbox } from "@/features/leads/LeadsInbox";
import { timed, timingRoute } from "@/features/observability/serverTiming";
import { can } from "@/features/permissions/can";
import { readBaseCurrency } from "@/features/settings/readBaseCurrency";
import { createContext } from "@/server/trpc/context";

export const metadata = { title: STRINGS.nav.leads };

export default async function LeadsPage(): Promise<React.ReactNode> {
  await timingRoute("/leads");
  const ctx = await createContext();
  if (ctx.actor === null) {
    return <main>Unauthorized</main>;
  }
  const actorId = ctx.actor.id;
  const [baseCurrency, prefs, customFieldDefs] = await timed("leads.data", () =>
    Promise.all([
      readBaseCurrency(db, AbortSignal.timeout(8000)),
      getPreferencesForActor(db, actorId),
      listDefs(db, "lead", {}, AbortSignal.timeout(8000)),
    ]),
  );
  const stored = prefs.ui.leadsView;
  const initialView =
    stored !== undefined
      ? {
          columns: stored.columns,
          sort: toLeadSort(stored.sort.field, stored.sort.dir, customFieldDefs),
        }
      : null;

  return (
    <main aria-label="Leads" className="h-full">
      <LeadsInbox
        baseCurrency={baseCurrency}
        initialView={initialView}
        customFieldDefs={customFieldDefs}
        canImport={can(ctx.actor, "data.import")}
      />
    </main>
  );
}
