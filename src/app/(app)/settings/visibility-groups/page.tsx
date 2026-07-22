import Link from "next/link";
import type { ReactNode } from "react";
import { PERMISSION_FLAGS } from "@/constants/permissionFlags";
import { STRINGS } from "@/constants/strings";
import { listVisibilityGroups } from "@/features/identity/visibility-groups.service";
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
import { VisibilityGroupsClient } from "./VisibilityGroupsClient";

const C = STRINGS.settings.columns;

export const metadata = { title: STRINGS.settings.visibilityGroups };

export default async function VisibilityGroupsPage(): Promise<ReactNode> {
  const { actor, db } = await createContext();
  if (actor === null || (actor.type !== "admin" && !actor.flags.has(PERMISSION_FLAGS.MANAGE))) {
    return <p className="text-sm text-red-600">{STRINGS.settings.requiresAdmin}</p>;
  }
  const rows = await listVisibilityGroups(db, AbortSignal.timeout(5000));
  return (
    <SettingsPage>
      <SettingsHeading
        title={STRINGS.settings.visibilityGroups}
        description={STRINGS.settings.visibilityGroupsDescription}
      />
      <SettingsCard className="shadow-none">
        <table className="w-full text-sm">
          <thead className={SETTINGS_TABLE_HEAD}>
            <tr className="border-b">
              <th className={SETTINGS_TABLE_HEADER_CELL}>{C.name}</th>
              <th className={SETTINGS_TABLE_HEADER_CELL}>{C.created}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.id} className={SETTINGS_TABLE_ROW}>
                <td className={SETTINGS_TABLE_CELL}>
                  <Link
                    href={`/settings/visibility-groups/${g.id}`}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {g.name}
                  </Link>
                </td>
                <td className={`${SETTINGS_TABLE_CELL} tabular-nums text-muted-foreground`}>
                  {g.createdAt.toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SettingsCard>
      <VisibilityGroupsClient />
    </SettingsPage>
  );
}
