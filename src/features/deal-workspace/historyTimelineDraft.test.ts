// Unit tests for folding unsent drafts into a record timeline. Pure, no DB.
import { describe, expect, it } from "vitest";
import { bucketByType } from "@/app/(app)/deals/[dealId]/tabs";
import type { DraftSummary } from "@/features/email/draftRepo";
import type { HistoryItem } from "./historyTimeline";
import { mergeDraftItems, partitionFocusHistory } from "./historyTimeline";

function draft(over: Partial<DraftSummary> = {}): DraftSummary {
  return {
    id: "d1",
    subject: "Outreach",
    bodyHtml: "<p>hi</p>",
    toEmails: ["poc@example.com"],
    ccEmails: [],
    threadId: null,
    accountId: "acct-1",
    visibility: "shared",
    linkDealId: "deal-1",
    linkPersonId: null,
    updatedAt: "2026-08-04T10:00:00Z",
    ...over,
  };
}

const created: HistoryItem = {
  kind: "created",
  id: "created",
  at: new Date("2026-08-01T10:00:00Z"),
  actorName: "Jenny",
};

describe("mergeDraftItems", () => {
  it("interleaves drafts with existing items by last edit, newest first", () => {
    const out = mergeDraftItems([created], [draft()]);

    expect(out.map((i) => i.kind)).toEqual(["emailDraft", "created"]);
    expect(out[0]?.at.toISOString()).toBe("2026-08-04T10:00:00.000Z");
  });

  it("returns the original list unchanged when there are no drafts", () => {
    expect(mergeDraftItems([created], [])).toEqual([created]);
  });

  it("keys each item by its draft id", () => {
    const out = mergeDraftItems(
      [],
      [draft({ id: "d1" }), draft({ id: "d2", updatedAt: "2026-08-06T10:00:00Z" })],
    );

    expect(out.map((i) => i.id)).toEqual(["d2", "d1"]);
  });
});

describe("draft items in the existing splits", () => {
  // A draft belongs beside the sent messages under the Email tab, which is filtered out of the
  // History bucket, so it must not be diverted into Focus the way an open activity is.
  it("lands a draft in History, next to the emails it will become", () => {
    const { pinned, focus, history } = partitionFocusHistory(mergeDraftItems([], [draft()]));

    expect(pinned).toHaveLength(0);
    expect(focus).toHaveLength(0);
    expect(history.map((i) => i.id)).toEqual(["d1"]);
  });

  it("buckets a draft under the email tab and nowhere else", () => {
    const buckets = bucketByType(mergeDraftItems([created], [draft()]));

    expect(buckets.email.map((i) => i.id)).toEqual(["d1"]);
    expect(buckets.activities).toHaveLength(0);
    expect(buckets.notes).toHaveLength(0);
    expect(buckets.changelog).toHaveLength(0);
  });
});
