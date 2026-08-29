import { SYNC_STALL_SECONDS } from "@/constants/email";

export type MailboxSyncHealth = "syncing" | "stalled" | "disconnected";

export interface MailboxSyncRow {
  status: string;
  lastSyncAtIso: string | null;
}

export function mailboxSyncHealth(row: MailboxSyncRow, now: Date): MailboxSyncHealth {
  if (row.status === "disconnected") return "disconnected";
  if (row.status === "error") return "stalled";
  if (row.lastSyncAtIso === null) return "syncing";
  const ageSeconds = (now.getTime() - new Date(row.lastSyncAtIso).getTime()) / 1000;
  return ageSeconds >= SYNC_STALL_SECONDS ? "stalled" : "syncing";
}
