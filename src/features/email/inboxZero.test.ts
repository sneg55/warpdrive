import { describe, expect, it } from "vitest";
import { isInboxZero, isMailboxConnected } from "./inboxZero";
import { NO_ATTRIBUTE_FILTER } from "./threadAttributeFilter";

const ZERO = {
  folder: "inbox",
  quickFilter: "all",
  attrFilter: NO_ATTRIBUTE_FILTER,
  searching: false,
  mailboxConnected: true,
  pending: false,
  failed: false,
  threadCount: 0,
} as const;

describe("isInboxZero", () => {
  it("is true for an empty, unfiltered inbox of a connected mailbox", () => {
    expect(isInboxZero(ZERO)).toBe(true);
  });

  it("is false while threads remain", () => {
    expect(isInboxZero({ ...ZERO, threadCount: 1 })).toBe(false);
  });

  it("is false outside the inbox folder", () => {
    expect(isInboxZero({ ...ZERO, folder: "sent" })).toBe(false);
    expect(isInboxZero({ ...ZERO, folder: "archive" })).toBe(false);
  });

  it("is false when a quick filter emptied the view", () => {
    expect(isInboxZero({ ...ZERO, quickFilter: "unmatched" })).toBe(false);
  });

  it("is false when an attribute filter emptied the view", () => {
    expect(isInboxZero({ ...ZERO, attrFilter: { ...NO_ATTRIBUTE_FILTER, unreadOnly: true } })).toBe(
      false,
    );
  });

  it("is false for an empty search result", () => {
    expect(isInboxZero({ ...ZERO, searching: true })).toBe(false);
  });

  it("is false when no mailbox is connected", () => {
    expect(isInboxZero({ ...ZERO, mailboxConnected: false })).toBe(false);
  });

  it("is false while the feed is loading or after it failed", () => {
    expect(isInboxZero({ ...ZERO, pending: true })).toBe(false);
    expect(isInboxZero({ ...ZERO, failed: true })).toBe(false);
  });
});

describe("isMailboxConnected", () => {
  const personal = { id: "p1", kind: "personal", status: "connected" } as const;
  const team = { id: "t1", kind: "team", status: "disconnected" } as const;

  it("is true when any mailbox is connected and none is selected", () => {
    expect(isMailboxConnected([personal, team], undefined)).toBe(true);
  });

  it("ignores a connected team mailbox when none is selected", () => {
    expect(
      isMailboxConnected(
        [
          { ...personal, status: "disconnected" },
          { ...team, status: "connected" },
        ],
        undefined,
      ),
    ).toBe(false);
  });

  it("is false when no mailbox exists", () => {
    expect(isMailboxConnected([], undefined)).toBe(false);
  });

  it("follows the selected mailbox's own status", () => {
    expect(isMailboxConnected([personal, team], "t1")).toBe(false);
    expect(isMailboxConnected([personal, { ...team, status: "connected" }], "t1")).toBe(true);
  });
});
