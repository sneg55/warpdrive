import type { ReactNode } from "react";
import { PERMISSION_FLAGS } from "@/constants/permissionFlags";
import { STRINGS } from "@/constants/strings";
import { db } from "@/db/client";
import { listTypes } from "@/features/activities/typesRepo";
import { createContext } from "@/server/trpc/context";
import { ActivityTypesClient } from "./ActivityTypesClient";

export const metadata = { title: STRINGS.settings.activities };

// Company settings > Activities tab (spec 6.2): activity-type catalog CRUD.
export default async function ActivitiesPage(): Promise<ReactNode> {
  const { actor } = await createContext();
  if (actor === null || (actor.type !== "admin" && !actor.flags.has(PERMISSION_FLAGS.MANAGE))) {
    return <p className="text-sm text-red-600">{STRINGS.settings.requiresAdmin}</p>;
  }

  const rows = await listTypes(db, { activeOnly: false }, AbortSignal.timeout(5000));
  const serializable = rows.map((t) => ({
    id: t.id,
    key: t.key,
    name: t.name,
    icon: t.icon,
    isSystem: t.isSystem,
    active: t.archivedAt === null,
  }));
  return <ActivityTypesClient rows={serializable} />;
}
