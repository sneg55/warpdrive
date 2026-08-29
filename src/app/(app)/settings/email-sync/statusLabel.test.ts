import { describe, expect, test } from "vitest";
import { mailboxDisplayHealth, mailboxStatusLabel } from "./statusLabel";
import { EMAIL_SYNC_STRINGS } from "./strings";

const NOW = new Date("2026-08-28T18:00:00Z");
const ago = (s: number): string => new Date(NOW.getTime() - s * 1000).toISOString();

describe("mailboxStatusLabel", () => {
  test("a mailbox with no row reads as disconnected", () => {
    expect(mailboxStatusLabel(null, NOW)).toBe(EMAIL_SYNC_STRINGS.statusDisconnected);
  });

  test("a mailbox syncing on cadence reads as connected", () => {
    expect(mailboxStatusLabel({ status: "connected", lastSyncAtIso: ago(60) }, NOW)).toBe(
      EMAIL_SYNC_STRINGS.statusConnected,
    );
  });

  test("a mailbox that stopped syncing hours ago stops claiming it is connected", () => {
    expect(mailboxStatusLabel({ status: "connected", lastSyncAtIso: ago(28800) }, NOW)).toBe(
      EMAIL_SYNC_STRINGS.statusStalled,
    );
  });

  test("the stalled wording says mail is not arriving, not merely that something is wrong", () => {
    expect(EMAIL_SYNC_STRINGS.statusStalled).toMatch(/not (arriving|syncing)/i);
  });

  test("before the browser clock exists, a disconnected mailbox still reads disconnected", () => {
    // The stall needs a clock, but the other states do not, so the pre-hydration render must not
    // fall back to claiming everything is connected.
    expect(mailboxStatusLabel({ status: "disconnected", lastSyncAtIso: null }, null)).toBe(
      EMAIL_SYNC_STRINGS.statusDisconnected,
    );
    expect(mailboxStatusLabel({ status: "error", lastSyncAtIso: null }, null)).toBe(
      EMAIL_SYNC_STRINGS.statusStalled,
    );
  });

  test("a stalled mailbox does not keep the healthy dot", () => {
    expect(mailboxDisplayHealth({ status: "connected", lastSyncAtIso: ago(28800) }, NOW)).toBe(
      "stalled",
    );
  });
});
