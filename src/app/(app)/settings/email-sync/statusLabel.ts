import { type MailboxSyncRow, mailboxSyncHealth } from "@/features/email/syncHealth";
import { EMAIL_SYNC_STRINGS } from "./strings";

export type MailboxDisplayHealth = "syncing" | "stalled" | "disconnected";

export function mailboxDisplayHealth(
  row: MailboxSyncRow | null,
  now: Date | null,
): MailboxDisplayHealth {
  if (row === null || row.status === "disconnected") return "disconnected";
  if (row.status === "error") return "stalled";
  if (now === null) return "syncing";
  return mailboxSyncHealth(row, now);
}

export function mailboxStatusLabel(row: MailboxSyncRow | null, now: Date | null): string {
  switch (mailboxDisplayHealth(row, now)) {
    case "disconnected":
      return EMAIL_SYNC_STRINGS.statusDisconnected;
    case "stalled":
      return EMAIL_SYNC_STRINGS.statusStalled;
    case "syncing":
      return EMAIL_SYNC_STRINGS.statusConnected;
  }
}

export function mailboxDotClass(health: MailboxDisplayHealth): string {
  if (health === "syncing") return "bg-green-500";
  if (health === "stalled") return "bg-warning";
  return "bg-muted-foreground/40";
}
