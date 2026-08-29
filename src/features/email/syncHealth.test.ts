import { describe, expect, test } from "vitest";
import { SYNC_STALL_SECONDS } from "@/constants/email";
import { mailboxSyncHealth } from "./syncHealth";

const NOW = new Date("2026-08-28T18:00:00Z");
const ago = (seconds: number): string => new Date(NOW.getTime() - seconds * 1000).toISOString();

describe("mailboxSyncHealth", () => {
  test("a mailbox that synced a tick ago is healthy", () => {
    expect(mailboxSyncHealth({ status: "connected", lastSyncAtIso: ago(90) }, NOW)).toBe("syncing");
  });

  test("a mailbox that has not synced for the stall window is stalled, whatever the column says", () => {
    // The bug this exists for: prod read status=connected while last_sync_at was 8 hours old and
    // 4,862 sync jobs had failed in a row.
    const health = mailboxSyncHealth({ status: "connected", lastSyncAtIso: ago(8 * 60 * 60) }, NOW);
    expect(health).toBe("stalled");
  });

  test("a few missed ticks are not a stall, so one throttled call does not cry wolf", () => {
    expect(
      mailboxSyncHealth({ status: "connected", lastSyncAtIso: ago(SYNC_STALL_SECONDS - 1) }, NOW),
    ).toBe("syncing");
  });

  test("the threshold itself counts as stalled, so the boundary is not a silent gap", () => {
    expect(
      mailboxSyncHealth({ status: "connected", lastSyncAtIso: ago(SYNC_STALL_SECONDS) }, NOW),
    ).toBe("stalled");
  });

  test("a mailbox that has never synced is not called stalled, it has nothing to be late for", () => {
    expect(mailboxSyncHealth({ status: "connected", lastSyncAtIso: null }, NOW)).toBe("syncing");
  });

  test("disconnected outranks everything: it is not stalled, it is switched off", () => {
    expect(
      mailboxSyncHealth({ status: "disconnected", lastSyncAtIso: ago(8 * 60 * 60) }, NOW),
    ).toBe("disconnected");
  });

  test("a mailbox already flagged error stays flagged even while inside the window", () => {
    expect(mailboxSyncHealth({ status: "error", lastSyncAtIso: ago(30) }, NOW)).toBe("stalled");
  });

  test("a clock that runs backwards does not read as a stall", () => {
    expect(mailboxSyncHealth({ status: "connected", lastSyncAtIso: ago(-600) }, NOW)).toBe(
      "syncing",
    );
  });
});
