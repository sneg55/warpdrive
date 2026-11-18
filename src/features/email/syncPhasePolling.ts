import { INBOX_SYNC_FAILED_POLL_MS, INBOX_SYNC_PHASE_POLL_MS } from "@/constants/inbox";
import type { MailboxSyncPhase } from "./mailboxSyncPhase";

const UNSETTLED_PHASES: ReadonlySet<MailboxSyncPhase> = new Set(["syncing", "failed"]);

export function syncPhasePollInterval(phase: MailboxSyncPhase): number | false {
  if (phase === "syncing") return INBOX_SYNC_PHASE_POLL_MS;
  if (phase === "failed") return INBOX_SYNC_FAILED_POLL_MS;
  return false;
}

export function shouldRefreshInboxOnPhaseChange(
  previous: MailboxSyncPhase,
  next: MailboxSyncPhase,
): boolean {
  return previous !== next && UNSETTLED_PHASES.has(previous);
}
