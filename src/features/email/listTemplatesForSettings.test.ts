import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser as seedUserRow } from "@/db/testing/factories";
import { createTemplate } from "./authoring";
import { listTemplatesForSettings } from "./emailAuthoringReads";

type Db = Parameters<Parameters<typeof withTestDb>[0]>[0];

async function seedUser(db: Db, label?: string): Promise<string> {
  return (await seedUserRow(db, label !== undefined ? { email: label } : undefined)).id;
}

describe("listTemplatesForSettings", () => {
  it("returns own + shared, flags isOwn, hides others' private templates", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db, "me@x.com");
      const them = await seedUser(db, "them@x.com");
      await createTemplate(
        db,
        { ownerId: me, name: "Mine", bodyHtml: "<p>m</p>", isShared: false, canShare: false },
        AbortSignal.timeout(5000),
      );
      await createTemplate(
        db,
        { ownerId: them, name: "Shared", bodyHtml: "<p>s</p>", isShared: true, canShare: true },
        AbortSignal.timeout(5000),
      );
      await createTemplate(
        db,
        { ownerId: them, name: "Private", bodyHtml: "<p>p</p>", isShared: false, canShare: false },
        AbortSignal.timeout(5000),
      );

      const rows = await listTemplatesForSettings(
        db,
        { actor: { id: me } as never },
        AbortSignal.timeout(5000),
      );
      const names = rows.map((r) => r.name);
      expect(names).toContain("Mine");
      expect(names).toContain("Shared");
      expect(names).not.toContain("Private");
      expect(rows.find((r) => r.name === "Mine")?.isOwn).toBe(true);
      expect(rows.find((r) => r.name === "Shared")?.isOwn).toBe(false);
    });
  });

  it("does not leak another user's owner_id for a shared template", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db, "me2@x.com");
      const them = await seedUser(db, "them2@x.com");
      await createTemplate(
        db,
        { ownerId: them, name: "Shared", bodyHtml: "<p>s</p>", isShared: true, canShare: true },
        AbortSignal.timeout(5000),
      );

      const rows = await listTemplatesForSettings(
        db,
        { actor: { id: me } as never },
        AbortSignal.timeout(5000),
      );
      const shared = rows.find((r) => r.name === "Shared");
      expect(shared).toBeDefined();
      // isOwn is the only gate the UI needs; the raw owner UUID must not reach the client.
      expect(shared).not.toHaveProperty("ownerId");
    });
  });
});
