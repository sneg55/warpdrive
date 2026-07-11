import type { ReactNode } from "react";
import { PERMISSION_FLAGS } from "@/constants/permissionFlags";
import { STRINGS } from "@/constants/strings";
import { listUsers } from "@/features/identity/users.service";
import { createContext } from "@/server/trpc/context";
import { SettingsHeading } from "../SettingsHeading";
import { UsersClient } from "./UsersClient";

export const metadata = { title: STRINGS.settings.users };

export default async function UsersPage(): Promise<ReactNode> {
  const { actor, db } = await createContext();
  if (actor === null || (actor.type !== "admin" && !actor.flags.has(PERMISSION_FLAGS.MANAGE))) {
    return <p className="text-sm text-red-600">{STRINGS.settings.requiresAdmin}</p>;
  }
  const rows = await listUsers(db, AbortSignal.timeout(5000));
  // Pass serializable plain objects to the client component (no Date, Set, Map).
  const serializable = rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    isAdmin: u.isAdmin,
    isActive: u.isActive,
    invitedAt: u.invitedAt === null ? null : u.invitedAt.toISOString(),
  }));
  return (
    <section>
      <SettingsHeading
        title={STRINGS.settings.users}
        description={STRINGS.settings.usersDescription}
      />
      <UsersClient rows={serializable} />
    </section>
  );
}
