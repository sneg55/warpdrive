import { describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { brevoCampaigns } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { campaign, makeBrevoFake } from "./brevoFake.test-helpers";
import { syncCatalog } from "./catalog";

const SIG = (): AbortSignal => new AbortController().signal;

describe("syncCatalog", () => {
  it("pages through the whole catalog and upserts every campaign", async () => {
    await withTestDb(async (db) => {
      const fake = makeBrevoFake();
      fake.catalog = Array.from({ length: 5 }, (_, i) => campaign(i + 1));
      const r = await syncCatalog({ db, client: fake.client, pageSize: 2 }, SIG());
      expect(r.ok).toBe(true);
      expect(fake.catalogCalls).toEqual([0, 2, 4]);
      expect(await db.select().from(brevoCampaigns)).toHaveLength(5);
    });
  });

  it("updates a campaign that changed on a later run", async () => {
    await withTestDb(async (db) => {
      const fake = makeBrevoFake();
      fake.catalog = [campaign(1)];
      await syncCatalog({ db, client: fake.client, pageSize: 100 }, SIG());
      fake.catalog = [{ ...campaign(1), name: "Renamed", status: "archive" }];
      await syncCatalog({ db, client: fake.client, pageSize: 100 }, SIG());
      const rows = await db.select().from(brevoCampaigns);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.name).toBe("Renamed");
      expect(rows[0]?.status).toBe("archive");
    });
  });

  it("keeps earlier pages and still succeeds when a later page fails", async () => {
    await withTestDb(async (db) => {
      const fake = makeBrevoFake();
      fake.catalog = Array.from({ length: 5 }, (_, i) => campaign(i + 1));
      fake.catalogFailAtOffset = 2;
      const r = await syncCatalog({ db, client: fake.client, pageSize: 2 }, SIG());
      expect(r.ok).toBe(true);
      expect(fake.catalogCalls).toEqual([0, 2]);
      expect(await db.select().from(brevoCampaigns)).toHaveLength(2);
    });
  });

  it("returns E_BREVO_005 on an unauthorized response", async () => {
    await withTestDb(async (db) => {
      const fake = makeBrevoFake();
      fake.catalogUnauthorized = true;
      const r = await syncCatalog({ db, client: fake.client, pageSize: 100 }, SIG());
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.id).toBe(ERROR_IDS.BREVO_UNAUTHORIZED);
    });
  });
});
