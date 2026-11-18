import { expect, it } from "vitest";
import { INBOX_SYNC_FAILED_POLL_MS, INBOX_SYNC_PHASE_POLL_MS } from "@/constants/inbox";
import { shouldRefreshInboxOnPhaseChange, syncPhasePollInterval } from "./syncPhasePolling";

it("polls quickly while the first sync is running", () => {
  expect(syncPhasePollInterval("syncing")).toBe(INBOX_SYNC_PHASE_POLL_MS);
});

it("keeps polling, more slowly, after a failed first sync so a background retry that recovers is seen", () => {
  expect(syncPhasePollInterval("failed")).toBe(INBOX_SYNC_FAILED_POLL_MS);
});

it("stops polling once the mailbox has settled", () => {
  expect(syncPhasePollInterval("awaitingMail")).toBe(false);
  expect(syncPhasePollInterval("ready")).toBe(false);
});

it("refreshes the inbox list when the phase leaves syncing or failed", () => {
  expect(shouldRefreshInboxOnPhaseChange("syncing", "awaitingMail")).toBe(true);
  expect(shouldRefreshInboxOnPhaseChange("failed", "awaitingMail")).toBe(true);
  expect(shouldRefreshInboxOnPhaseChange("syncing", "failed")).toBe(true);
  expect(shouldRefreshInboxOnPhaseChange("failed", "failed")).toBe(false);
  expect(shouldRefreshInboxOnPhaseChange("awaitingMail", "awaitingMail")).toBe(false);
});
