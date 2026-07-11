import type { ReactNode } from "react";
import { PERMISSION_FLAGS } from "@/constants/permissionFlags";
import { STRINGS } from "@/constants/strings";
import { listPermissionSets } from "@/features/identity/permission-sets.service";
import { createContext } from "@/server/trpc/context";
import { SettingsHeading } from "../SettingsHeading";
import { PermissionSetsClient } from "./PermissionSetsClient";

const C = STRINGS.settings.columns;
const V = STRINGS.settings.values;

export const metadata = { title: STRINGS.settings.permissionSets };

export default async function PermissionSetsPage(): Promise<ReactNode> {
  const { actor, db } = await createContext();
  if (actor === null || (actor.type !== "admin" && !actor.flags.has(PERMISSION_FLAGS.MANAGE))) {
    return <p className="text-sm text-red-600">{STRINGS.settings.requiresAdmin}</p>;
  }
  const rows = await listPermissionSets(db, AbortSignal.timeout(5000));
  // Serializable projection for the client editor (flags is a plain JSONB object).
  const sets = rows.map((ps) => ({ id: ps.id, name: ps.name, flags: ps.flags }));
  return (
    <section>
      <SettingsHeading
        title={STRINGS.settings.permissionSets}
        description={STRINGS.settings.permissionSetsDescription}
      />
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2 pr-4">{C.name}</th>
            <th className="py-2 pr-4">{C.flagsEnabled}</th>
            <th className="py-2">{C.default}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((ps) => {
            const flagCount = Object.values(ps.flags).filter(Boolean).length;
            return (
              <tr key={ps.id} className="border-b">
                <td className="py-2 pr-4">{ps.name}</td>
                <td className="py-2 pr-4">{flagCount}</td>
                <td className="py-2">{ps.isDefault ? V.yes : V.no}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <PermissionSetsClient sets={sets} />
    </section>
  );
}
