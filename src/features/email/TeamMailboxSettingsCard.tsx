"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MultiCombobox } from "@/components/ui/MultiCombobox";
import { EMAIL_PROVIDER_KIND } from "@/constants/email";
import { TEAM_MAILBOX_DEFAULT_BACKFILL } from "@/constants/teamMailbox";
import { readCsrfToken } from "@/utils/csrfCookie";
import { AgenticConnectDialog } from "./AgenticConnectDialog";
import { AgenticMailboxNotice } from "./AgenticMailboxNotice";
import { disconnectMailboxAction } from "./actions";
import { setTeamMailboxMembersAction, updateTeamMailboxAction } from "./teamMailboxActions";
import type { TeamMailboxSettings } from "./teamMailboxAdmin";
import { redirectToTeamMailboxConsent } from "./teamMailboxConsentRedirect";

export function TeamMailboxSettingsCard({
  mailbox,
  users,
  agenticEnabled,
}: {
  mailbox: TeamMailboxSettings;
  users: { id: string; name: string }[];
  agenticEnabled: boolean;
}): React.ReactNode {
  const router = useRouter();
  const [name, setName] = useState(mailbox.display_name);
  const [overdue, setOverdue] = useState(String(mailbox.overdue_after_hours));
  const [members, setMembers] = useState(mailbox.member_ids);
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [agenticDialog, setAgenticDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const result = await updateTeamMailboxAction(
        { accountId: mailbox.id, displayName: name, overdueAfterHours: Number(overdue) },
        readCsrfToken(),
      );
      if (!result.ok) {
        setError(result.error.id);
        return;
      }
      const membership = await setTeamMailboxMembersAction(
        { accountId: mailbox.id, userIds: members },
        readCsrfToken(),
      );
      if (!membership.ok) setError(membership.error.id);
      else router.refresh();
    } finally {
      setPending(false);
    }
  }
  async function reconnect(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      setError(
        await redirectToTeamMailboxConsent({
          backfillDays: TEAM_MAILBOX_DEFAULT_BACKFILL,
          loginHint: mailbox.email_address,
        }),
      );
    } finally {
      setPending(false);
    }
  }
  const disconnected = mailbox.status === "disconnected";
  const agentic = mailbox.provider === EMAIL_PROVIDER_KIND.agenticInbox;
  async function disconnect(): Promise<void> {
    setPending(true);
    try {
      const result = await disconnectMailboxAction(readCsrfToken(), { accountId: mailbox.id });
      if (!result.ok) setError(result.error.id);
      else router.refresh();
    } finally {
      setPending(false);
      setConfirm(false);
    }
  }
  return (
    <section className="space-y-4 rounded-lg border p-4" aria-label={mailbox.display_name}>
      <div>
        <h2 className="font-medium">{mailbox.email_address}</h2>
        <p className="text-sm text-muted-foreground">
          {mailbox.status}, {mailbox.member_ids.length} members
        </p>
        {agentic && <Badge variant="secondary">Agentic inbox</Badge>}
      </div>
      {agentic && (
        <AgenticMailboxNotice
          disconnected={disconnected}
          lastErrorId={mailbox.last_error_id}
          agenticEnabled={agenticEnabled}
        />
      )}
      {disconnected && !agentic && (
        <p className="text-sm text-destructive">
          Google disconnected this mailbox, so sync and sending are stopped. Reconnect it by signing
          in as {mailbox.email_address}.
        </p>
      )}
      <p className="text-sm">
        Import: {mailbox.backfill_status ?? "pending"}
        {mailbox.backfill_error_id !== null ? ` (${mailbox.backfill_error_id})` : ""}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label htmlFor={`${mailbox.id}-name`} className="space-y-1 text-sm">
          Display name
          <Input
            id={`${mailbox.id}-name`}
            aria-label="Display name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label htmlFor={`${mailbox.id}-overdue`} className="space-y-1 text-sm">
          Overdue after (hours)
          <Input
            id={`${mailbox.id}-overdue`}
            aria-label="Overdue after (hours)"
            type="number"
            min={1}
            value={overdue}
            onChange={(event) => setOverdue(event.target.value)}
          />
        </label>
      </div>
      <MultiCombobox
        ariaLabel="Mailbox members"
        values={members}
        onChange={setMembers}
        options={users.map((user) => ({ value: user.id, label: user.name }))}
      />
      {error !== null && <p role="alert">{error}</p>}
      <div className="flex gap-2">
        <Button disabled={pending} onClick={() => void save()}>
          Save mailbox
        </Button>
        {agentic ? (
          <>
            {agenticEnabled && (
              <Button variant="outline" disabled={pending} onClick={() => setAgenticDialog(true)}>
                Reconnect
              </Button>
            )}
            {!disconnected && (
              <Button variant="outline" disabled={pending} onClick={() => setConfirm(true)}>
                Disconnect
              </Button>
            )}
          </>
        ) : disconnected ? (
          <Button variant="outline" disabled={pending} onClick={() => void reconnect()}>
            Reconnect
          </Button>
        ) : (
          <Button variant="outline" disabled={pending} onClick={() => setConfirm(true)}>
            Disconnect
          </Button>
        )}
      </div>
      {agentic && (
        <AgenticConnectDialog
          open={agenticDialog}
          onOpenChange={setAgenticDialog}
          reconnectTarget={{ accountId: mailbox.id, address: mailbox.email_address }}
        />
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Disconnect team mailbox?"
        description="Sync and sending will stop. Stored conversations remain available."
        confirmLabel="Disconnect"
        onConfirm={() => void disconnect()}
        pending={pending}
      />
    </section>
  );
}
