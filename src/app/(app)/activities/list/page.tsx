import { redirect } from "next/navigation";
import { STRINGS } from "@/constants/strings";
import { ActivitiesTable } from "@/features/activities/ActivitiesTable";
import { createContext } from "@/server/trpc/context";

export const metadata = { title: STRINGS.nav.activities };

// The Activities to-do list (Pipedrive parity): a table with List/Calendar toggle, an
// owner/completed/date-range filter toolbar, type tabs driven by listTypes, and a done checkbox.
// ActivitiesTable fetches its own data via tRPC (activities.listRows), so this page only guards
// auth and renders it.
export default async function ActivityListPage(): Promise<React.ReactNode> {
  const ctx = await createContext();
  if (ctx.actor === null) {
    redirect("/login");
  }
  return (
    <main aria-label="Activities" className="h-full">
      <ActivitiesTable />
    </main>
  );
}
