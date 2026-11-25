import { describe, expect, it } from "vitest";
import { BREVO_NOT_FOUND_RETRY_MS } from "@/constants/brevo";
import { brevoContactCampaigns, brevoTrackedEmails } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { makeBrevoFake } from "./brevoFake.test-helpers";
import { runBrevoSync } from "./sync";
import {
  clock,
  deliveredIn,
  HOUR_MS,
  linkEmails,
  START_MS,
  signal,
  TODAY,
  trackedRow,
  YESTERDAY,
} from "./sync.test-helpers";
import { addDays } from "./windows";

describe("runBrevoSync per email", () => {
  it("walks the first backfill window by window and ends with coverage through yesterday", async () => {
    await withTestDb(async (db) => {
      await linkEmails(db, ["a@example.com"]);
      const fake = makeBrevoFake();
      fake.emails.set("a@example.com", deliveredIn);
      const c = clock();
      const r = await runBrevoSync({ db, client: fake.client, nowMs: c.nowMs }, signal());
      expect(r.ok).toBe(true);
      expect(fake.statsCalls).toHaveLength(5);
      expect(fake.statsCalls[0]?.window.startDate).toBe("2025-09-29");
      expect(fake.statsCalls.at(-1)?.window.endDate).toBe(TODAY);
      const row = await trackedRow(db, "a@example.com");
      expect(row?.coveredThrough).toBe(YESTERDAY);
      expect(row?.lastRefreshedAt).not.toBeNull();
      expect(await db.select().from(brevoContactCampaigns)).toHaveLength(5);
    });
  });

  it("resumes at the next window after an abort between windows", async () => {
    await withTestDb(async (db) => {
      await linkEmails(db, ["a@example.com"]);
      const fake = makeBrevoFake();
      fake.emails.set("a@example.com", deliveredIn);
      const c = clock();
      const controller = new AbortController();
      fake.onStatsCall = () => {
        if (fake.statsCalls.length === 3) controller.abort();
      };
      await expect(
        runBrevoSync({ db, client: fake.client, nowMs: c.nowMs }, controller.signal),
      ).rejects.toThrow();
      const interrupted = await trackedRow(db, "a@example.com");
      const secondWindowEnd = fake.statsCalls[1]?.window.endDate;
      expect(interrupted?.coveredThrough).toBe(secondWindowEnd);
      expect(interrupted?.lastRefreshedAt).toBeNull();
      expect(interrupted?.notFoundAt).toBeNull();
      expect(await db.select().from(brevoContactCampaigns)).toHaveLength(2);

      fake.onStatsCall = () => {};
      fake.statsCalls.length = 0;
      c.state.ms += HOUR_MS;
      const r = await runBrevoSync({ db, client: fake.client, nowMs: c.nowMs }, signal());
      expect(r.ok).toBe(true);
      expect(fake.statsCalls[0]?.window.startDate).toBe(addDays(secondWindowEnd ?? "", 1));
      expect((await trackedRow(db, "a@example.com"))?.coveredThrough).toBe(YESTERDAY);
    });
  });

  it("keeps committed windows when a later window fails and retries from there", async () => {
    await withTestDb(async (db) => {
      await linkEmails(db, ["a@example.com"]);
      const fake = makeBrevoFake();
      fake.emails.set("a@example.com", { ...deliveredIn, failOnCall: 3 });
      const c = clock();
      const r = await runBrevoSync({ db, client: fake.client, nowMs: c.nowMs }, signal());
      expect(r.ok && r.value.failed).toBe(1);
      const row = await trackedRow(db, "a@example.com");
      expect(row?.coveredThrough).toBe(fake.statsCalls[1]?.window.endDate);
      expect(row?.lastRefreshedAt).toBeNull();
      expect(await db.select().from(brevoContactCampaigns)).toHaveLength(2);
    });
  });

  it("fills the whole gap for an email reactivated after 200 days", async () => {
    await withTestDb(async (db) => {
      await linkEmails(db, ["a@example.com"]);
      await db.insert(brevoTrackedEmails).values({
        email: "a@example.com",
        coveredThrough: addDays(TODAY, -200),
        lastRefreshedAt: new Date(START_MS - 200 * 24 * HOUR_MS),
        active: false,
      });
      const fake = makeBrevoFake();
      fake.emails.set("a@example.com", deliveredIn);
      await runBrevoSync({ db, client: fake.client, nowMs: clock().nowMs }, signal());
      expect(fake.statsCalls).toHaveLength(3);
      expect(fake.statsCalls[0]?.window.startDate).toBe(addDays(TODAY, -199));
      expect((await trackedRow(db, "a@example.com"))?.coveredThrough).toBe(YESTERDAY);
    });
  });

  it("re-reads the last 90 days on a daily refresh without moving coverage backwards", async () => {
    await withTestDb(async (db) => {
      await linkEmails(db, ["a@example.com"]);
      await db.insert(brevoTrackedEmails).values({
        email: "a@example.com",
        coveredThrough: YESTERDAY,
        lastRefreshedAt: new Date(START_MS - 25 * HOUR_MS),
      });
      const fake = makeBrevoFake();
      fake.emails.set("a@example.com", deliveredIn);
      await runBrevoSync({ db, client: fake.client, nowMs: clock().nowMs }, signal());
      expect(fake.statsCalls).toHaveLength(1);
      expect(fake.statsCalls[0]?.window.startDate).toBe(addDays(TODAY, -89));
      expect((await trackedRow(db, "a@example.com"))?.coveredThrough).toBe(YESTERDAY);
    });
  });

  it("skips an email refreshed within 24 hours", async () => {
    await withTestDb(async (db) => {
      await linkEmails(db, ["a@example.com"]);
      await db.insert(brevoTrackedEmails).values({
        email: "a@example.com",
        coveredThrough: YESTERDAY,
        lastRefreshedAt: new Date(START_MS - 2 * HOUR_MS),
      });
      const fake = makeBrevoFake();
      fake.emails.set("a@example.com", deliveredIn);
      await runBrevoSync({ db, client: fake.client, nowMs: clock().nowMs }, signal());
      expect(fake.statsCalls).toHaveLength(0);
    });
  });
});

describe("runBrevoSync not found", () => {
  it("records not_found_at, writes nothing and skips the email for 7 days", async () => {
    await withTestDb(async (db) => {
      await linkEmails(db, ["a@example.com"]);
      const fake = makeBrevoFake();
      fake.emails.set("a@example.com", { kind: "notFound" });
      const c = clock();
      await runBrevoSync({ db, client: fake.client, nowMs: c.nowMs }, signal());
      const row = await trackedRow(db, "a@example.com");
      expect(row?.notFoundAt).not.toBeNull();
      expect(row?.lastRefreshedAt).toBeNull();
      expect(row?.coveredThrough).toBeNull();
      expect(await db.select().from(brevoContactCampaigns)).toHaveLength(0);

      fake.statsCalls.length = 0;
      c.state.ms += BREVO_NOT_FOUND_RETRY_MS - HOUR_MS;
      await runBrevoSync({ db, client: fake.client, nowMs: c.nowMs }, signal());
      expect(fake.statsCalls).toHaveLength(0);

      c.state.ms += 2 * HOUR_MS;
      await runBrevoSync({ db, client: fake.client, nowMs: c.nowMs }, signal());
      expect(fake.statsCalls).toHaveLength(1);
    });
  });

  it("clears not_found_at when the contact appears later", async () => {
    await withTestDb(async (db) => {
      await linkEmails(db, ["a@example.com"]);
      const fake = makeBrevoFake();
      fake.emails.set("a@example.com", { kind: "notFound" });
      const c = clock();
      await runBrevoSync({ db, client: fake.client, nowMs: c.nowMs }, signal());
      fake.emails.set("a@example.com", deliveredIn);
      c.state.ms += BREVO_NOT_FOUND_RETRY_MS + HOUR_MS;
      await runBrevoSync({ db, client: fake.client, nowMs: c.nowMs }, signal());
      const row = await trackedRow(db, "a@example.com");
      expect(row?.notFoundAt).toBeNull();
      expect(row?.lastRefreshedAt).not.toBeNull();
    });
  });
});
