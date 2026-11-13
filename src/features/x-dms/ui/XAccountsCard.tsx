"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MultiCombobox } from "@/components/ui/MultiCombobox";
import { readCsrfToken } from "@/utils/csrfCookie";
import type { XAccountSettings } from "../accountAdmin";
import {
  disconnectXAccountAction,
  setXAccountMembersAction,
  updateXAccountAction,
} from "../actions";
import { XConnectButton } from "./XConnectButton";

const STATUS_LABEL: Record<XAccountSettings["status"], string> = {
  connected: "Connected",
  reconnect_required: "Reconnect required",
};

const memberCount = (n: number): string => (n === 1 ? "1 member" : `${n} members`);

export function XAccountCard({
  account,
  users,
}: {
  account: XAccountSettings;
  users: { id: string; name: string }[];
}): React.ReactNode {
  const router = useRouter();
  const [name, setName] = useState(account.displayName);
  const [overdue, setOverdue] = useState(String(account.overdueAfterHours));
  const [members, setMembers] = useState(account.memberIds);
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const result = await updateXAccountAction(
        { accountId: account.id, displayName: name, overdueAfterHours: Number(overdue) },
        readCsrfToken(),
      );
      if (!result.ok) {
        setError(result.error.id);
        return;
      }
      const membership = await setXAccountMembersAction(
        { accountId: account.id, userIds: members },
        readCsrfToken(),
      );
      if (!membership.ok) setError(membership.error.id);
      else router.refresh();
    } finally {
      setPending(false);
    }
  }
  async function disconnect(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const result = await disconnectXAccountAction({ accountId: account.id }, readCsrfToken());
      if (!result.ok) setError(result.error.id);
      else router.refresh();
    } finally {
      setPending(false);
      setConfirm(false);
    }
  }
  const needsReconnect = account.status === "reconnect_required";
  return (
    <section className="space-y-4 rounded-lg border p-4" aria-label={account.displayName}>
      <div>
        <h2 className="font-medium">@{account.username}</h2>
        <p className="text-sm text-muted-foreground">
          {STATUS_LABEL[account.status]}, {memberCount(account.memberIds.length)}, last sync{" "}
          {account.lastSyncAt === null ? "never" : account.lastSyncAt.toLocaleString()}
        </p>
      </div>
      {needsReconnect && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">
            Reconnect required{account.lastErrorId !== null ? ` (${account.lastErrorId})` : ""}
          </p>
          <XConnectButton label="Reconnect" />
        </div>
      )}
      {!needsReconnect && account.lastErrorId !== null && (
        <p className="text-sm">Last error: {account.lastErrorId}</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label htmlFor={`${account.id}-name`} className="space-y-1 text-sm">
          Display name
          <Input
            id={`${account.id}-name`}
            aria-label="Display name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label htmlFor={`${account.id}-overdue`} className="space-y-1 text-sm">
          Overdue after (hours)
          <Input
            id={`${account.id}-overdue`}
            aria-label="Overdue after (hours)"
            type="number"
            min={1}
            value={overdue}
            onChange={(event) => setOverdue(event.target.value)}
          />
        </label>
      </div>
      <MultiCombobox
        ariaLabel="X account members"
        values={members}
        onChange={setMembers}
        options={users.map((user) => ({ value: user.id, label: user.name }))}
      />
      {error !== null && <p role="alert">{error}</p>}
      <div className="flex gap-2">
        <Button disabled={pending} onClick={() => void save()}>
          Save X account
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => setConfirm(true)}>
          Disconnect
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Disconnect X account?"
        description="Sync and sending will stop and the connection is revoked. Stored conversations are removed."
        confirmLabel="Disconnect X account"
        onConfirm={() => void disconnect()}
        pending={pending}
      />
    </section>
  );
}

export function XAccountsCard({
  enabled,
  accounts,
  users,
}: {
  enabled: boolean;
  accounts: XAccountSettings[];
  users: { id: string; name: string }[];
}): React.ReactNode {
  if (!enabled) return null;
  return (
    <section className="space-y-4" aria-label="X accounts">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-medium">X accounts</h2>
        <XConnectButton label="Connect X account" />
      </div>
      {accounts.map((account) => (
        <XAccountCard key={account.id} account={account} users={users} />
      ))}
    </section>
  );
}
