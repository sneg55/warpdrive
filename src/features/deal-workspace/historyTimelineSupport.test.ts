import { describe, expect, it } from "vitest";
import { bucketByType } from "@/app/(app)/deals/[dealId]/tabs";
import type { SupportConversationSummary, SupportScope } from "@/features/intercom/supportTypes";
import { countHistoryTabs } from "./historyTabCounts";
import type { HistoryItem } from "./historyTimeline";
import { mergeSupportItems, partitionFocusHistory } from "./historyTimeline";

function conv(over: Partial<SupportConversationSummary> = {}): SupportConversationSummary {
  return {
    id: "c1",
    title: "Billing question",
    snippet: "Hi there",
    state: "open",
    messageCount: 3,
    lastReplierName: "Agent",
    lastReplierType: "admin",
    lastPartAt: "2026-08-02T10:00:00Z",
    ...over,
  };
}

const scope: SupportScope = { kind: "person", personId: "p1" };

const created: HistoryItem = {
  kind: "created",
  id: "created",
  at: new Date("2026-08-01T10:00:00Z"),
  actorName: "Jenny",
};

describe("mergeSupportItems", () => {
  it("interleaves conversations by their last visible message, newest first", () => {
    const out = mergeSupportItems([created], [conv({ lastPartAt: "2026-07-01T00:00:00Z" })], scope);
    expect(out.map((i) => i.kind)).toEqual(["created", "supportConversation"]);
  });

  it("keys a conversation apart from any other item id", () => {
    const out = mergeSupportItems([], [conv()], scope);
    expect(out[0]?.id).toBe("intercom-c1");
    expect(out[0]?.kind === "supportConversation" && out[0].scope).toEqual(scope);
  });

  it("returns the same list when there is nothing to merge", () => {
    const items = [created];
    expect(mergeSupportItems(items, [], scope)).toBe(items);
  });

  it("lands in History under the Email tab and counts toward it", () => {
    const { history } = partitionFocusHistory(mergeSupportItems([created], [conv()], scope));
    const buckets = bucketByType(history);
    expect(buckets.email.map((i) => i.kind)).toEqual(["supportConversation"]);
    expect(countHistoryTabs(buckets, undefined).email).toBe(1);
  });
});
