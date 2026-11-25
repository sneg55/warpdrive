import { describe, expect, it } from "vitest";
import { brevoContactCampaigns } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { campaignStatsSchema } from "./brevoSchemas";
import { foldStats, upsertCampaignRows } from "./mergeWindow";

const EMAIL = "pat@example.com";
const stats = (raw: unknown) => campaignStatsSchema.parse(raw);

describe("foldStats", () => {
  it("sets first_clicked_at from the earliest link time and collects every url", () => {
    const rows = foldStats(
      EMAIL,
      stats({
        clicked: [
          {
            campaignId: 1,
            links: [
              { url: "https://b.test", eventTime: "2026-01-02T10:00:00.000+00:00" },
              { url: "https://a.test", eventTime: "2026-01-01T10:00:00.000+00:00" },
            ],
          },
        ],
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.firstClickedAt).toEqual(new Date("2026-01-01T10:00:00.000Z"));
    expect(rows[0]?.clickedUrls).toEqual(["https://a.test", "https://b.test"]);
  });

  it("sets unsubscribed_at for a user unsubscribe with a campaign", () => {
    const rows = foldStats(
      EMAIL,
      stats({
        unsubscriptions: {
          userUnsubscription: [{ campaignId: 4, eventTime: "2026-01-05T10:00:00.000Z" }],
        },
      }),
    );
    expect(rows[0]?.campaignId).toBe(4);
    expect(rows[0]?.unsubscribedAt).toEqual(new Date("2026-01-05T10:00:00.000Z"));
  });

  it("writes nothing for a null campaign or an admin unsubscribe", () => {
    const rows = foldStats(
      EMAIL,
      stats({
        unsubscriptions: {
          userUnsubscription: [{ campaignId: null, eventTime: "2026-01-05T10:00:00.000Z" }],
          adminUnsubscription: [{ eventTime: "2026-01-06T10:00:00.000Z" }],
        },
      }),
    );
    expect(rows).toEqual([]);
  });

  it("groups every event type of one campaign into one row", () => {
    const rows = foldStats(
      EMAIL,
      stats({
        messagesSent: [{ campaignId: 1, eventTime: "2026-01-01T10:00:00.000Z" }],
        delivered: [{ campaignId: 1, eventTime: "2026-01-01T10:00:05.000Z" }],
        opened: [
          { campaignId: 1, eventTime: "2026-01-01T12:00:00.000Z" },
          { campaignId: 1, eventTime: "2026-01-01T11:00:00.000Z" },
        ],
        hardBounces: [{ campaignId: 2, eventTime: "2026-01-02T10:00:00.000Z" }],
        softBounces: [{ campaignId: 3, eventTime: "2026-01-03T10:00:00.000Z" }],
        complaints: [{ campaignId: 3, eventTime: "2026-01-03T11:00:00.000Z" }],
      }),
    );
    const byId = new Map(rows.map((r) => [r.campaignId, r]));
    expect(byId.size).toBe(3);
    expect(byId.get(1)?.firstOpenedAt).toEqual(new Date("2026-01-01T11:00:00.000Z"));
    expect(byId.get(1)?.sentAt).toEqual(new Date("2026-01-01T10:00:00.000Z"));
    expect(byId.get(1)?.deliveredAt).toEqual(new Date("2026-01-01T10:00:05.000Z"));
    expect(byId.get(2)?.hardBouncedAt).toEqual(new Date("2026-01-02T10:00:00.000Z"));
    expect(byId.get(3)?.softBouncedAt).toEqual(new Date("2026-01-03T10:00:00.000Z"));
    expect(byId.get(3)?.complainedAt).toEqual(new Date("2026-01-03T11:00:00.000Z"));
  });
});

describe("upsertCampaignRows", () => {
  it("keeps the earliest timestamp across two overlapping windows and unions the urls", async () => {
    await withTestDb(async (db) => {
      const first = foldStats(
        EMAIL,
        stats({
          opened: [{ campaignId: 1, eventTime: "2026-01-01T12:00:00.000Z" }],
          clicked: [
            {
              campaignId: 1,
              links: [{ url: "https://b.test", eventTime: "2026-01-01T13:00:00.000Z" }],
            },
          ],
        }),
      );
      const second = foldStats(
        EMAIL,
        stats({
          opened: [{ campaignId: 1, eventTime: "2026-01-01T11:00:00.000Z" }],
          clicked: [
            {
              campaignId: 1,
              links: [{ url: "https://a.test", eventTime: "2026-01-01T14:00:00.000Z" }],
            },
          ],
          delivered: [{ campaignId: 1, eventTime: "2026-01-01T10:00:05.000Z" }],
        }),
      );
      await upsertCampaignRows(db, first);
      await upsertCampaignRows(db, second);
      const [row] = await db.select().from(brevoContactCampaigns);
      expect(row?.firstOpenedAt).toEqual(new Date("2026-01-01T11:00:00.000Z"));
      expect(row?.firstClickedAt).toEqual(new Date("2026-01-01T13:00:00.000Z"));
      expect(row?.deliveredAt).toEqual(new Date("2026-01-01T10:00:05.000Z"));
      expect(row?.clickedUrls).toEqual(["https://a.test", "https://b.test"]);
    });
  });

  it("changes nothing when the same window is applied again", async () => {
    await withTestDb(async (db) => {
      const rows = foldStats(
        EMAIL,
        stats({
          opened: [{ campaignId: 1, eventTime: "2026-01-01T12:00:00.000Z" }],
          clicked: [
            {
              campaignId: 1,
              links: [{ url: "https://a.test", eventTime: "2026-01-01T13:00:00.000Z" }],
            },
          ],
        }),
      );
      await upsertCampaignRows(db, rows);
      const [before] = await db.select().from(brevoContactCampaigns);
      await upsertCampaignRows(db, rows);
      const [after] = await db.select().from(brevoContactCampaigns);
      expect(after).toEqual(before);
    });
  });

  it("accepts an empty batch", async () => {
    await withTestDb(async (db) => {
      await upsertCampaignRows(db, []);
      expect(await db.select().from(brevoContactCampaigns)).toEqual([]);
    });
  });
});
