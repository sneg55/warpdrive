import { describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { brevoCampaigns, brevoTrackedEmails } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { campaign, makeBrevoFake } from "./brevoFake.test-helpers";
import { runBrevoSync } from "./sync";
import { clock, deliveredIn, linkEmails, signal, trackedRow, YESTERDAY } from "./sync.test-helpers";

describe("runBrevoSync run level", () => {
  it("isolates a failing email from the others", async () => {
    await withTestDb(async (db) => {
      await linkEmails(db, ["a@example.com", "b@example.com"]);
      const fake = makeBrevoFake();
      fake.emails.set("a@example.com", { kind: "fail", id: ERROR_IDS.BREVO_HTTP_FAILED });
      fake.emails.set("b@example.com", deliveredIn);
      const r = await runBrevoSync({ db, client: fake.client, nowMs: clock().nowMs }, signal());
      expect(r.ok && r.value.failed).toBe(1);
      expect(r.ok && r.value.refreshed).toBe(1);
      expect((await trackedRow(db, "b@example.com"))?.lastRefreshedAt).not.toBeNull();
      expect((await trackedRow(db, "a@example.com"))?.lastRefreshedAt).toBeNull();
    });
  });

  it("tries a repeatedly failing email after the healthy ones on the next run", async () => {
    await withTestDb(async (db) => {
      await linkEmails(db, ["a@example.com", "b@example.com", "c@example.com"]);
      const fake = makeBrevoFake();
      fake.emails.set("a@example.com", { kind: "fail", id: ERROR_IDS.BREVO_NETWORK_FAILED });
      fake.emails.set("b@example.com", deliveredIn);
      fake.emails.set("c@example.com", deliveredIn);
      const c = clock();
      fake.onStatsCall = () => {
        c.state.ms += 60_000;
      };
      const deps = {
        db,
        client: fake.client,
        nowMs: c.nowMs,
        startBudgetMs: 30_000,
      };
      await runBrevoSync(deps, signal());
      expect(fake.statsCalls.map((x) => x.email)).toEqual(["a@example.com"]);
      fake.statsCalls.length = 0;
      await runBrevoSync(deps, signal());
      expect(fake.statsCalls[0]?.email).toBe("b@example.com");
    });
  });

  it("stops starting emails once the time budget has passed", async () => {
    await withTestDb(async (db) => {
      await linkEmails(db, ["a@example.com", "b@example.com", "c@example.com"]);
      for (const email of ["a@example.com", "b@example.com", "c@example.com"]) {
        await db.insert(brevoTrackedEmails).values({ email, coveredThrough: YESTERDAY });
      }
      const fake = makeBrevoFake();
      for (const email of ["a@example.com", "b@example.com", "c@example.com"]) {
        fake.emails.set(email, deliveredIn);
      }
      const c = clock();
      fake.onStatsCall = () => {
        c.state.ms += 60_000;
      };
      const r = await runBrevoSync(
        { db, client: fake.client, nowMs: c.nowMs, startBudgetMs: 90_000 },
        signal(),
      );
      expect(r.ok && r.value.stoppedForBudget).toBe(true);
      expect(fake.statsCalls).toHaveLength(2);
    });
  });

  it("ends the run with E_BREVO_005 on a 401 from a contact call and starts no further email", async () => {
    await withTestDb(async (db) => {
      await linkEmails(db, ["a@example.com", "b@example.com"]);
      const fake = makeBrevoFake();
      fake.emails.set("a@example.com", { kind: "fail", id: ERROR_IDS.BREVO_UNAUTHORIZED });
      fake.emails.set("b@example.com", deliveredIn);
      const r = await runBrevoSync({ db, client: fake.client, nowMs: clock().nowMs }, signal());
      expect(!r.ok && r.error.id).toBe(ERROR_IDS.BREVO_UNAUTHORIZED);
      expect(fake.statsCalls.map((x) => x.email)).toEqual(["a@example.com"]);
    });
  });

  it("ends the run with E_BREVO_005 on a 401 from the catalog before any contact call", async () => {
    await withTestDb(async (db) => {
      await linkEmails(db, ["a@example.com"]);
      const fake = makeBrevoFake();
      fake.catalogUnauthorized = true;
      fake.emails.set("a@example.com", deliveredIn);
      const r = await runBrevoSync({ db, client: fake.client, nowMs: clock().nowMs }, signal());
      expect(!r.ok && r.error.id).toBe(ERROR_IDS.BREVO_UNAUTHORIZED);
      expect(fake.statsCalls).toHaveLength(0);
    });
  });

  it("keeps earlier catalog pages and still syncs emails when a catalog page fails", async () => {
    await withTestDb(async (db) => {
      await linkEmails(db, ["a@example.com"]);
      const fake = makeBrevoFake();
      fake.catalog = Array.from({ length: 5 }, (_, i) => campaign(i + 1));
      fake.catalogFailAtOffset = 2;
      fake.emails.set("a@example.com", deliveredIn);
      const r = await runBrevoSync(
        { db, client: fake.client, nowMs: clock().nowMs, catalogPageSize: 2 },
        signal(),
      );
      expect(r.ok).toBe(true);
      expect(await db.select().from(brevoCampaigns)).toHaveLength(2);
      expect((await trackedRow(db, "a@example.com"))?.lastRefreshedAt).not.toBeNull();
    });
  });

  it("deactivates emails that lost their deal link and never fetches them", async () => {
    await withTestDb(async (db) => {
      await linkEmails(db, ["a@example.com"]);
      await db.insert(brevoTrackedEmails).values({ email: "orphan@example.com" });
      const fake = makeBrevoFake();
      fake.emails.set("a@example.com", deliveredIn);
      fake.emails.set("orphan@example.com", deliveredIn);
      await runBrevoSync({ db, client: fake.client, nowMs: clock().nowMs }, signal());
      expect(fake.statsCalls.every((x) => x.email === "a@example.com")).toBe(true);
      expect((await trackedRow(db, "orphan@example.com"))?.active).toBe(false);
    });
  });
});
