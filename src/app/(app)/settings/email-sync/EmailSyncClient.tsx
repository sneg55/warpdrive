"use client";
import { Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { connectGmailStart, disconnectMailboxAction } from "@/features/email/actions";
import { readCsrfToken } from "@/utils/csrfCookie";
import {
  SettingsCard,
  SettingsCardBody,
  SettingsCardFooter,
  SettingsCardHeader,
} from "../SettingsSurface";
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

function statusLabel(mailbox: MailboxView | null): string {
  if (mailbox === null || mailbox.status === "disconnected") return S.statusDisconnected;
  if (mailbox.status === "error") return S.statusError;
  return S.statusConnected;
}

export function EmailSyncClient({ mailbox }: { mailbox: MailboxView | null }): React.ReactNode {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connected = mailbox !== null && mailbox.status === "connected";

  // Connect a fresh mailbox or reconnect a disconnected/error one: both mint a consent URL
  // server-side (which also sets the single-use OAuth state cookie) and hand off to Google.
  // The OAuth callback rebinds the row, so reconnect reuses the same account, not a duplicate.
  async function startConnect(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const { url } = await connectGmailStart();
      window.location.href = url;
    } catch {
      // Minting the consent URL failed (dead session or transient error): un-stick the button
      // and surface a retry hint rather than leaving it disabled on "Connecting..." forever.
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
            className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-gray-300"}`}
          />
          <span className="text-sm font-medium">{statusLabel(mailbox)}</span>
        </div>
        {mailbox !== null ? (
          <>
            <p className="text-sm text-muted-foreground">{S.connectedAs(mailbox.emailAddress)}</p>
            <p className="text-sm text-muted-foreground">{formatSync(mailbox.lastSyncAtIso)}</p>
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
        {connected ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => void disconnect()}
          >
            {pending ? S.disconnecting : S.disconnect}
          </Button>
        ) : (
          <Button type="button" disabled={pending} onClick={() => void startConnect()}>
            {pending ? S.connecting : mailbox === null ? S.connect : S.reconnect}
          </Button>
        )}
      </SettingsCardFooter>
    </SettingsCard>
  );
}
