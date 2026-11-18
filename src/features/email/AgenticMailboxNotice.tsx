import { agenticMailboxErrorMessage } from "./agenticConnectMessages";

export function AgenticMailboxNotice({
  disconnected,
  lastErrorId,
  agenticEnabled,
}: {
  disconnected: boolean;
  lastErrorId: string | null;
  agenticEnabled: boolean;
}): React.ReactNode {
  if (disconnected) {
    return (
      <p className="text-sm text-destructive">
        This mailbox is disconnected, so sync and sending are stopped.
        {agenticEnabled ? " Reconnect it with new credentials." : ""}
      </p>
    );
  }
  if (lastErrorId === null) return null;
  return <p className="text-sm text-destructive">{agenticMailboxErrorMessage(lastErrorId)}</p>;
}
