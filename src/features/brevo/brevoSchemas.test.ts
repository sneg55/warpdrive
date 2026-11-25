import { describe, expect, it } from "vitest";
import { campaignListSchema, campaignStatsSchema } from "./brevoSchemas";

describe("campaignStatsSchema", () => {
  it("treats missing arrays as no events", () => {
    const parsed = campaignStatsSchema.parse({});
    expect(parsed.messagesSent).toEqual([]);
    expect(parsed.clicked).toEqual([]);
    expect(parsed.unsubscriptions.userUnsubscription).toEqual([]);
    expect(parsed.unsubscriptions.adminUnsubscription).toEqual([]);
  });

  it("accepts the documented shape of every event type", () => {
    const parsed = campaignStatsSchema.parse({
      messagesSent: [{ campaignId: 1, eventTime: "2026-01-01T10:00:00.000+00:00" }],
      delivered: [{ campaignId: 1, eventTime: "2026-01-01T10:00:05.000+00:00" }],
      opened: [
        { campaignId: 1, eventTime: "2026-01-01T11:00:00.000+00:00", count: 2, ip: "1.1.1.1" },
      ],
      clicked: [
        {
          campaignId: 1,
          links: [
            {
              url: "https://a.test",
              count: 1,
              eventTime: "2026-01-01T12:00:00.000+00:00",
              ip: "1.1.1.1",
            },
          ],
        },
      ],
      hardBounces: [{ campaignId: 2, eventTime: "2026-01-02T10:00:00.000+00:00" }],
      softBounces: [{ campaignId: 3, eventTime: "2026-01-03T10:00:00.000+00:00" }],
      complaints: [{ campaignId: 4, eventTime: "2026-01-04T10:00:00.000+00:00" }],
      unsubscriptions: {
        userUnsubscription: [
          { campaignId: 5, eventTime: "2026-01-05T10:00:00.000+00:00" },
          { campaignId: null, eventTime: "2026-01-06T10:00:00.000+00:00" },
        ],
        adminUnsubscription: [{ eventTime: "2026-01-07T10:00:00.000+00:00" }],
      },
    });
    expect(parsed.clicked[0]?.links[0]?.url).toBe("https://a.test");
    expect(parsed.unsubscriptions.userUnsubscription[1]?.campaignId).toBeNull();
  });

  it("rejects an event without a campaign id", () => {
    expect(
      campaignStatsSchema.safeParse({ delivered: [{ eventTime: "2026-01-01T10:00:00.000+00:00" }] })
        .success,
    ).toBe(false);
  });
});

describe("campaignListSchema", () => {
  it("accepts a catalog page with and without optional fields", () => {
    const parsed = campaignListSchema.parse({
      campaigns: [
        {
          id: 1,
          name: "A",
          subject: "S",
          status: "sent",
          sentDate: "2026-01-01T10:00:00.000+00:00",
        },
        { id: 2, name: "B", status: "draft" },
      ],
      count: 2,
    });
    expect(parsed.campaigns).toHaveLength(2);
  });

  it("reads an unparseable sentDate as no send date instead of rejecting the page", () => {
    const parsed = campaignListSchema.parse({
      campaigns: [
        { id: 1, name: "A", status: "draft", sentDate: "" },
        { id: 2, name: "B", status: "sent", sentDate: "not a date" },
      ],
      count: 2,
    });
    expect(parsed.campaigns.map((c) => c.sentDate)).toEqual([null, null]);
  });
});
