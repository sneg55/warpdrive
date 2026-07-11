import type { ReactNode } from "react";
import { PERMISSION_FLAGS } from "@/constants/permissionFlags";
import { can } from "@/features/permissions/can";
import { createContext } from "@/server/trpc/context";
import { SettingsNav } from "./SettingsNav";

// Wraps every /settings/* page with the grouped left secondary menu (Pipedrive settings IA).
// Company-overview items are shown only to admins / managers.
export default async function SettingsLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactNode> {
  const { actor } = await createContext();
  const isAdmin =
    actor !== null && (actor.type === "admin" || actor.flags.has(PERMISSION_FLAGS.MANAGE));
  const canImport = actor !== null && can(actor, "data.import");
  return (
    <div className="flex gap-6">
      <SettingsNav isAdmin={isAdmin} canImport={canImport} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
