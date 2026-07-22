import type { ReactNode } from "react";
import { PERMISSION_FLAGS } from "@/constants/permissionFlags";
import { STRINGS } from "@/constants/strings";
import { listPermissionSets } from "@/features/identity/permission-sets.service";
import { createContext } from "@/server/trpc/context";
import { SettingsHeading } from "../SettingsHeading";
import {
  SETTINGS_TABLE_CELL,
  SETTINGS_TABLE_HEAD,
  SETTINGS_TABLE_HEADER_CELL,
  SETTINGS_TABLE_ROW,
  SettingsCard,
  SettingsPage,
} from "../SettingsSurface";
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
    <SettingsPage>
      <SettingsHeading
        title={STRINGS.settings.permissionSets}
        description={STRINGS.settings.permissionSetsDescription}
      />
      <SettingsCard className="shadow-none">
        <table className="w-full text-sm">
          <thead className={SETTINGS_TABLE_HEAD}>
            <tr className="border-b">
              <th className={SETTINGS_TABLE_HEADER_CELL}>{C.name}</th>
              <th className={SETTINGS_TABLE_HEADER_CELL}>{C.flagsEnabled}</th>
              <th className={SETTINGS_TABLE_HEADER_CELL}>{C.default}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((ps) => {
              const flagCount = Object.values(ps.flags).filter(Boolean).length;
              return (
                <tr key={ps.id} className={SETTINGS_TABLE_ROW}>
                  <td className={SETTINGS_TABLE_CELL}>{ps.name}</td>
                  <td className={`${SETTINGS_TABLE_CELL} tabular-nums`}>{flagCount}</td>
                  <td className={SETTINGS_TABLE_CELL}>{ps.isDefault ? V.yes : V.no}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SettingsCard>
      <PermissionSetsClient sets={sets} />
    </SettingsPage>
  );
}
