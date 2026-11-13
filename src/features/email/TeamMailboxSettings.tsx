"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import {
  TEAM_MAILBOX_BACKFILL_CHOICES,
  TEAM_MAILBOX_DEFAULT_BACKFILL,
} from "@/constants/teamMailbox";
import { TeamMailboxSettingsCard } from "./TeamMailboxSettingsCard";
import type { TeamMailboxSettings as MailboxSettings } from "./teamMailboxAdmin";
import { redirectToTeamMailboxConsent } from "./teamMailboxConsentRedirect";

export function TeamMailboxSettings({
  mailboxes,
  users,
}: {
  mailboxes: MailboxSettings[];
  users: { id: string; name: string }[];
}): React.ReactNode {
  const [backfill, setBackfill] = useState(String(TEAM_MAILBOX_DEFAULT_BACKFILL));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function connect(): Promise<void> {
    setPending(true);
    try {
      setError(await redirectToTeamMailboxConsent({ backfillDays: Number(backfill) }));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          ariaLabel="Import history"
          value={backfill}
          onChange={setBackfill}
          options={TEAM_MAILBOX_BACKFILL_CHOICES.map((value) => ({
            value: String(value),
            label: `${value} days`,
          }))}
        />
        <Button disabled={pending} onClick={() => void connect()}>
          Connect team mailbox
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Imported conversations start read. Unanswered conversations keep their original reply
        status.
      </p>
      {error !== null && <p role="alert">{error}</p>}
      {mailboxes.map((mailbox) => (
        <TeamMailboxSettingsCard key={mailbox.id} mailbox={mailbox} users={users} />
      ))}
    </div>
  );
}
