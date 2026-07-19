import { STRINGS } from "@/constants/strings";
import { db } from "@/db/client";
import { getPreferencesForActor } from "@/features/identity/preferencesForActor";
import type { LeadSort } from "@/features/leads/inbox/useLeadSort";
import { LeadsInbox } from "@/features/leads/LeadsInbox";
import type { LeadSortField } from "@/features/leads/schemas";
import { LEAD_SORT_FIELDS } from "@/features/leads/schemas";
import { can } from "@/features/permissions/can";
import { readBaseCurrency } from "@/features/settings/readBaseCurrency";
import { createContext } from "@/server/trpc/context";

export const metadata = { title: STRINGS.nav.leads };

// Narrow the persisted (untyped) sort field to a known LeadSortField; drop the whole view otherwise.
function toLeadSort(field: string, dir: "asc" | "desc"): LeadSort | null {
  return (LEAD_SORT_FIELDS as readonly string[]).includes(field)
    ? { field: field as LeadSortField, dir }
    : null;
}

export default async function LeadsPage(): Promise<React.ReactNode> {
  const ctx = await createContext();
  if (ctx.actor === null) {
    return <main>Unauthorized</main>;
  }
  const [baseCurrency, prefs] = await Promise.all([
    readBaseCurrency(db, AbortSignal.timeout(8000)),
    getPreferencesForActor(db, ctx.actor.id),
  ]);
  const stored = prefs.ui.leadsView;
  const sort = stored !== undefined ? toLeadSort(stored.sort.field, stored.sort.dir) : null;
  const initialView =
    stored !== undefined && sort !== null ? { columns: stored.columns, sort } : null;

  return (
    <main aria-label="Leads" className="h-full">
      <LeadsInbox
        baseCurrency={baseCurrency}
        initialView={initialView}
        canImport={can(ctx.actor, "data.import")}
      />
    </main>
  );
}
