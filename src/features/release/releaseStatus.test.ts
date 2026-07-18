import { describe, expect, it } from "vitest";
import { appReleaseStatus } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { readReleaseStatus, upsertReleaseStatus } from "./releaseStatus";

describe("releaseStatus", () => {
  it("returns null when no row has been cached yet", async () => {
    await withTestDb(async (db) => {
      expect(await readReleaseStatus(db)).toBeNull();
    });
  });

  it("persists a fetched release and reads it back with a fetchedAt timestamp", async () => {
    await withTestDb(async (db) => {
      await upsertReleaseStatus(db, {
        latestTag: "v1.7.0",
        releaseUrl: "https://github.com/sneg55/warpdrive/releases/tag/v1.7.0",
        releaseNotes: "notes",
      });
      const row = await readReleaseStatus(db);
      expect(row?.latestTag).toBe("v1.7.0");
      expect(row?.releaseUrl).toBe("https://github.com/sneg55/warpdrive/releases/tag/v1.7.0");
      expect(row?.releaseNotes).toBe("notes");
      expect(row?.fetchedAt).toBeInstanceOf(Date);
    });
  });

  it("keeps a single row across repeated upserts, with the latest values winning", async () => {
    await withTestDb(async (db) => {
      await upsertReleaseStatus(db, { latestTag: "v1.7.0", releaseUrl: null, releaseNotes: null });
      await upsertReleaseStatus(db, {
        latestTag: "v1.8.0",
        releaseUrl: "u",
        releaseNotes: "n",
      });
      const rows = await db.select().from(appReleaseStatus);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.latestTag).toBe("v1.8.0");
    });
  });
});
