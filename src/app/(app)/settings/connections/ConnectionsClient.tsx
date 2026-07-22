"use client";

import { Plug } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { STRINGS } from "@/constants/strings";
import { revokeConnectionAction } from "@/features/oauth/revokeAction";
import { readCsrfToken } from "@/utils/csrfCookie";
import { SettingsCard, SettingsCardBody, SettingsCardHeader } from "../SettingsSurface";

export interface ConnectionView {
  clientId: string;
  clientName: string;
  connectedAtIso: string | null;
  lastUsedAtIso: string | null;
}

const S = STRINGS.settings;

function formatDate(iso: string | null): string {
  return iso === null ? S.connectedAppsNeverUsed : new Date(iso).toLocaleString();
}

export function ConnectionsClient({
  connections: initialConnections,
}: {
  connections: ConnectionView[];
}): React.ReactNode {
  const router = useRouter();
  const [connections, setConnections] = useState(initialConnections);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function revoke(clientId: string): Promise<void> {
    setPendingId(clientId);
    setError(null);
    try {
      const result = await revokeConnectionAction(clientId, readCsrfToken());
      if (!result.ok) {
        setError(S.connectedAppsRevokeError);
        return;
      }
      setConnections((current) => current.filter((row) => row.clientId !== clientId));
      router.refresh();
    } catch {
      setError(S.connectedAppsRevokeError);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <SettingsCard>
      <SettingsCardHeader
        icon={<Plug className="size-4" aria-hidden="true" />}
        title={S.connectedAppsList}
        description={S.connectedAppsListDescription}
      />
      <SettingsCardBody className="p-0">
        {connections.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">{S.connectedAppsEmpty}</p>
        ) : (
          <ul className="divide-y">
            {connections.map((connection) => (
              <li key={connection.clientId} className="flex items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{connection.clientName}</p>
                  <p className="text-sm text-muted-foreground">
                    {S.connectedAppsConnected(formatDate(connection.connectedAtIso))}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {connection.lastUsedAtIso === null
                      ? S.connectedAppsNeverUsed
                      : S.connectedAppsLastUsed(formatDate(connection.lastUsedAtIso))}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pendingId !== null}
                  onClick={() => void revoke(connection.clientId)}
                >
                  {pendingId === connection.clientId
                    ? S.connectedAppsRevoking
                    : S.connectedAppsRevoke}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {error !== null ? (
          <p className="border-t px-5 py-3 text-sm text-red-600" aria-live="polite">
            {error}
          </p>
        ) : null}
      </SettingsCardBody>
    </SettingsCard>
  );
}
