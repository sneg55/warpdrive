import Link from "next/link";
import type { ReactNode } from "react";
import { PERMISSION_FLAGS } from "@/constants/permissionFlags";
import { STRINGS } from "@/constants/strings";
import { listVisibilityGroups } from "@/features/identity/visibility-groups.service";
import { createContext } from "@/server/trpc/context";
import { SettingsHeading } from "../SettingsHeading";
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
    <section>
      <SettingsHeading
        title={STRINGS.settings.visibilityGroups}
        description={STRINGS.settings.visibilityGroupsDescription}
      />
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2 pr-4">{C.name}</th>
            <th className="py-2">{C.created}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.id} className="border-b">
              <td className="py-2 pr-4">
                <Link
                  href={`/settings/visibility-groups/${g.id}`}
                  className="text-blue-600 hover:underline"
                >
                  {g.name}
                </Link>
              </td>
              <td className="py-2">{g.createdAt.toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <VisibilityGroupsClient />
    </section>
  );
}
