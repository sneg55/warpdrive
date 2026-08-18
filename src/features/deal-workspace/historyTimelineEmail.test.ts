// Unit tests for folding linked emails into an existing record timeline. Pure, no DB.
import { describe, expect, it } from "vitest";
import { bucketByType } from "@/app/(app)/deals/[dealId]/tabs";
import type { EmailTimelineMessage } from "@/features/email/entityMessageReads";
import type { HistoryItem } from "./historyTimeline";
import { mergeEmailItems, partitionFocusHistory } from "./historyTimeline";

function msg(over: Partial<EmailTimelineMessage> = {}): EmailTimelineMessage {
  return {
    messageId: "m1",
    threadId: "t1",
    subject: "Follow up",
    sentAt: "2026-08-02T10:00:00Z",
    createdAt: "2026-08-02T10:00:01Z",
    direction: "inbound",
    fromEmail: "them@example.com",
    fromName: "Them",
    toEmails: ["me@example.com"],
    snippet: "a snippet",
    hasAttachment: false,
    canCompose: true,
    ...over,
  };
}

const created: HistoryItem = {
  kind: "created",
  id: "created",
  at: new Date("2026-08-01T10:00:00Z"),
  actorName: "Jenny",
};

describe("mergeEmailItems", () => {
  it("interleaves emails with existing items, newest first", () => {
    const out = mergeEmailItems([created], [msg()]);

    expect(out.map((i) => i.kind)).toEqual(["email", "created"]);
  });

  it("preserves every non-email item", () => {
    const note: HistoryItem = {
      kind: "note",
      id: "n1",
      at: new Date("2026-08-03T10:00:00Z"),
      body: "hi",
      pinned: false,
      actorName: null,
    };

    const out = mergeEmailItems([created, note], [msg()]);

    expect(out.map((i) => i.id)).toEqual(["n1", "m1", "created"]);
  });

  it("falls back to createdAt when the message has no sentAt", () => {
    const out = mergeEmailItems([], [msg({ sentAt: null, createdAt: "2026-08-05T10:00:00Z" })]);

    expect(out[0]?.at.toISOString()).toBe("2026-08-05T10:00:00.000Z");
  });

  it("returns the original list unchanged when there are no emails", () => {
    const out = mergeEmailItems([created], []);

    expect(out).toEqual([created]);
  });

  it("keys each item by its message id so two messages of one thread both render", () => {
    const out = mergeEmailItems(
      [],
      [msg({ messageId: "m1" }), msg({ messageId: "m2", sentAt: "2026-08-03T10:00:00Z" })],
    );

    expect(out.map((i) => i.id)).toEqual(["m2", "m1"]);
  });
});

describe("email items in the existing splits", () => {
  it("never lands an email in Focus or Pinned", () => {
    const merged = mergeEmailItems([], [msg()]);

    const { pinned, focus, history } = partitionFocusHistory(merged);

    expect(pinned).toHaveLength(0);
    expect(focus).toHaveLength(0);
    expect(history).toHaveLength(1);
  });

  it("buckets email items under the email tab and nowhere else", () => {
    const merged = mergeEmailItems([created], [msg()]);

    const buckets = bucketByType(merged);

    expect(buckets.email.map((i) => i.id)).toEqual(["m1"]);
    expect(buckets.activities).toHaveLength(0);
    expect(buckets.notes).toHaveLength(0);
    expect(buckets.changelog).toHaveLength(0);
    expect(buckets.all.map((i) => i.id)).toEqual(["m1", "created"]);
  });
});
