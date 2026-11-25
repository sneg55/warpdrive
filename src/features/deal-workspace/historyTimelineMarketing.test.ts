import { describe, expect, it } from "vitest";
import { bucketByType } from "@/app/(app)/deals/[dealId]/tabs";
import { BREVO_TIMELINE_LIMIT } from "@/constants/brevo";
import type { MarketingCampaignItem } from "@/features/brevo/types";
import type { SupportScope } from "@/features/intercom/supportTypes";
import { countHistoryTabs } from "./historyTabCounts";
import type { HistoryItem } from "./historyTimeline";
import { mergeMarketingItems, partitionFocusHistory } from "./historyTimeline";

function campaign(over: Partial<MarketingCampaignItem> = {}): MarketingCampaignItem {
  return {
    campaignId: 7,
    campaignName: "Autumn launch",
    subject: null,
    recipientEmail: "pat@example.com",
    recipientPersonId: "p1",
    at: "2026-08-02T10:00:00.000Z",
    sentAt: "2026-08-02T10:00:00.000Z",
    deliveredAt: null,
    firstOpenedAt: null,
    firstClickedAt: null,
    clickedUrls: [],
    hardBouncedAt: null,
    softBouncedAt: null,
    complainedAt: null,
    unsubscribedAt: null,
    ...over,
  };
}

const scope: SupportScope = { kind: "deal", dealId: "d1" };

const created: HistoryItem = {
  kind: "created",
  id: "created",
  at: new Date("2026-08-01T10:00:00Z"),
  actorName: "Jenny",
};

describe("mergeMarketingItems", () => {
  it("interleaves campaigns by their time, newest first", () => {
    const out = mergeMarketingItems(
      [created],
      { items: [campaign({ at: "2026-07-01T00:00:00.000Z" })], truncated: false },
      scope,
    );
    expect(out.map((i) => i.kind)).toEqual(["created", "marketingCampaign"]);
  });

  it("keys each recipient's copy of a campaign apart", () => {
    const out = mergeMarketingItems(
      [],
      {
        items: [
          campaign({ recipientEmail: "a@example.com", recipientPersonId: "p1" }),
          campaign({ recipientEmail: "b@example.com", recipientPersonId: "p2" }),
        ],
        truncated: false,
      },
      scope,
    );
    expect(new Set(out.map((i) => i.id)).size).toBe(2);
    expect(out.every((i) => i.id.startsWith("brevo-"))).toBe(true);
    expect(out[0]?.kind === "marketingCampaign" && out[0].scope).toEqual(scope);
  });

  it("returns the same list when there is nothing to merge", () => {
    const items = [created];
    expect(mergeMarketingItems(items, { items: [], truncated: false }, scope)).toBe(items);
  });

  it("lands in History under the Email tab and counts toward it", () => {
    const { history } = partitionFocusHistory(
      mergeMarketingItems([created], { items: [campaign()], truncated: false }, scope),
    );
    const buckets = bucketByType(history);
    expect(buckets.email.map((i) => i.kind)).toEqual(["marketingCampaign"]);
    expect(countHistoryTabs(buckets, undefined).email).toBe(1);
  });

  it("adds a truncation notice after the oldest campaign that no tab count includes", () => {
    const out = mergeMarketingItems(
      [],
      {
        items: [
          campaign({ campaignId: 2, at: "2026-08-02T10:00:00.000Z" }),
          campaign({ campaignId: 1, at: "2026-08-01T10:00:00.000Z" }),
        ],
        truncated: true,
      },
      scope,
    );
    expect(out.map((i) => i.kind)).toEqual([
      "marketingCampaign",
      "marketingCampaign",
      "marketingTruncated",
    ]);
    const last = out.at(-1);
    expect(last?.kind === "marketingTruncated" && last.limit).toBe(BREVO_TIMELINE_LIMIT);
    const counts = countHistoryTabs(bucketByType(out), undefined);
    expect(counts.email).toBe(2);
    expect(counts.all).toBe(2);
  });
});
