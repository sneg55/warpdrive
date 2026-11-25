"use client";
import { Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import type React from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ERROR_IDS } from "@/constants/errorIds";
import { connectGmailStart, disconnectMailboxAction } from "@/features/email/actions";
import { readCsrfToken } from "@/utils/csrfCookie";
import {
  SettingsCard,
  SettingsCardBody,
  SettingsCardFooter,
  SettingsCardHeader,
} from "../SettingsSurface";
import { mailboxDisplayHealth, mailboxDotClass, mailboxStatusLabel } from "./statusLabel";
import { EMAIL_SYNC_STRINGS } from "./strings";

const S = EMAIL_SYNC_STRINGS;

export interface MailboxView {
  id: string;
  emailAddress: string;
  status: "connected" | "disconnected" | "error";
  lastSyncAtIso: string | null;
  lastErrorId: string | null;
}

function formatSync(iso: string | null): string {
  if (iso === null) return S.neverSynced;
  return S.lastSynced(new Date(iso).toLocaleString());
}

function connectError(errorId: string): string {
  return errorId === ERROR_IDS.GMAIL_NOT_CONFIGURED ? S.gmailNotConfigured : S.actionError;
}

function MailboxActionButton({
  connected,
  hasMailbox,
  pending,
  googleConfigured,
  onConnect,
  onDisconnect,
}: {
  connected: boolean;
  hasMailbox: boolean;
  pending: boolean;
  googleConfigured: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}): React.ReactNode {
  if (connected) {
    return (
      <Button type="button" variant="outline" disabled={pending} onClick={onDisconnect}>
        {pending ? S.disconnecting : S.disconnect}
      </Button>
    );
  }
  if (!googleConfigured)
    return <p className="text-sm text-muted-foreground">{S.gmailNotConfigured}</p>;
  return (
    <Button type="button" disabled={pending} onClick={onConnect}>
      {pending ? S.connecting : hasMailbox ? S.reconnect : S.connect}
    </Button>
  );
}

export function EmailSyncClient({
  mailbox,
  googleConfigured = true,
}: {
  mailbox: MailboxView | null;
  googleConfigured?: boolean;
}): React.ReactNode {
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setNow(new Date()), []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connected = mailbox !== null && mailbox.status === "connected";
  const health = mailboxDisplayHealth(mailbox, now);

  async function startConnect(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const result = await connectGmailStart();
      if (result.ok) {
        window.location.href = result.value.url;
        return;
      }
      setPending(false);
      setError(connectError(result.error.id));
    } catch {
      setPending(false);
      setError(S.actionError);
    }
  }

  async function disconnect(): Promise<void> {
    if (mailbox === null) return;
    setPending(true);
    setError(null);
    const r = await disconnectMailboxAction(readCsrfToken(), { accountId: mailbox.id });
    setPending(false);
    if (r.ok) {
      router.refresh();
    } else {
      setError(S.actionError);
    }
  }

  return (
    <SettingsCard>
      <SettingsCardHeader
        icon={<Mail className="size-4" aria-hidden="true" />}
        title="Gmail connection"
        description="Connect one mailbox to sync messages and activity."
      />
      <SettingsCardBody>
        <div className="mb-1 flex items-center gap-2">
          <span
            data-status={mailbox?.status ?? "none"}
            data-health={health}
            className={`inline-block h-2 w-2 rounded-full ${mailboxDotClass(health)}`}
          />
          <span className="text-sm font-medium">{mailboxStatusLabel(mailbox, now)}</span>
        </div>
        {mailbox !== null ? (
          <>
            <p className="text-sm text-muted-foreground">{S.connectedAs(mailbox.emailAddress)}</p>
            <p className="text-sm text-muted-foreground">{formatSync(mailbox.lastSyncAtIso)}</p>
            {health === "stalled" ? (
              <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-sm">
                {S.stalledHint}
              </p>
            ) : null}
            {mailbox.lastErrorId !== null ? (
              <p className="text-sm text-red-600">
                {S.lastErrorLabel}: {mailbox.lastErrorId}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{S.notConnected}</p>
        )}
      </SettingsCardBody>

      <SettingsCardFooter>
        {error !== null ? <span className="mr-auto text-sm text-red-600">{error}</span> : null}
        <MailboxActionButton
          connected={connected}
          hasMailbox={mailbox !== null}
          pending={pending}
          googleConfigured={googleConfigured}
          onConnect={() => void startConnect()}
          onDisconnect={() => void disconnect()}
        />
      </SettingsCardFooter>
    </SettingsCard>
  );
}
