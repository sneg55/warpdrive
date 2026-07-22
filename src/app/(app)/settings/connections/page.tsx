import type { ReactNode } from "react";
import { STRINGS } from "@/constants/strings";
import { createContext } from "@/server/trpc/context";
import { createCaller } from "@/server/trpc/root";
import { SettingsHeading } from "../SettingsHeading";
import { SettingsPage } from "../SettingsSurface";
import { ConnectionsClient } from "./ConnectionsClient";

const S = STRINGS.settings;

export const metadata = { title: S.connectedApps };

export default async function ConnectionsPage(): Promise<ReactNode> {
  const ctx = await createContext();
  if (ctx.actor === null) return <p className="text-sm text-red-600">{S.requiresAuth}</p>;

  const connections = await createCaller(ctx).oauth.listConnections();
  return (
    <SettingsPage>
      <SettingsHeading title={S.connectedApps} description={S.connectedAppsDescription} />
      <ConnectionsClient
        connections={connections.map((row) => ({
          clientId: row.clientId,
          clientName: row.clientName,
          connectedAtIso: row.connectedAt?.toISOString() ?? null,
          lastUsedAtIso: row.lastUsedAt?.toISOString() ?? null,
        }))}
      />
    </SettingsPage>
  );
}
