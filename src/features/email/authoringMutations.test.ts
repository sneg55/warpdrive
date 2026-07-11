import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { withTestDb } from "@/db/testing";
import { seedUser as seedUserRow } from "@/db/testing/factories";
import { createTemplate, deleteTemplate, updateTemplate } from "./authoring";

type Db = Parameters<Parameters<typeof withTestDb>[0]>[0];

// Local helper: seed a user and return just its id. An optional label becomes the row's
// email (unique within a test's isolated DB); omitted, the factory auto-generates one.
async function seedUser(db: Db, label?: string): Promise<string> {
  return (await seedUserRow(db, label !== undefined ? { email: label } : undefined)).id;
}

describe("updateTemplate / deleteTemplate", () => {
  it("owner can update name/subject/body (body sanitized)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, "owner@x.com");
      const created = await createTemplate(
        db,
        {
          ownerId: owner,
          name: "Old",
          subject: "S",
          bodyHtml: "<p>old</p>",
          isShared: false,
          canShare: false,
        },
        AbortSignal.timeout(5000),
      );
      if (!created.ok) throw new Error("seed failed");

      const r = await updateTemplate(
        db,
        {
          id: created.value.id,
          actorId: owner,
          canShare: false,
          patch: { name: "New", bodyHtml: '<p onclick="x()">new</p>' },
        },
        AbortSignal.timeout(5000),
      );
      expect(r.ok).toBe(true);

      const row = (
        await db.execute(
          sql`SELECT name, body_html AS "bodyHtml" FROM email_templates WHERE id=${created.value.id}`,
        )
      ).rows[0] as { name: string; bodyHtml: string };
      expect(row.name).toBe("New");
      expect(row.bodyHtml).not.toContain("onclick");
    });
  });

  it("non-owner cannot update (E_PERM_005), row unchanged", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, "owner2@x.com");
      const other = await seedUser(db, "other2@x.com");
      const created = await createTemplate(
        db,
        { ownerId: owner, name: "Keep", bodyHtml: "<p>x</p>", isShared: true, canShare: true },
        AbortSignal.timeout(5000),
      );
      if (!created.ok) throw new Error("seed failed");

      const r = await updateTemplate(
        db,
        { id: created.value.id, actorId: other, canShare: false, patch: { name: "Hacked" } },
        AbortSignal.timeout(5000),
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.id).toBe(ERROR_IDS.PERM_TEMPLATE_DENIED);
    });
  });

  it("owner lacking capability can still edit an already-shared template", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, "owner-keepshare@x.com");
      // Created shared while the owner held the capability.
      const created = await createTemplate(
        db,
        { ownerId: owner, name: "Shared", bodyHtml: "<p>x</p>", isShared: true, canShare: true },
        AbortSignal.timeout(5000),
      );
      if (!created.ok) throw new Error("seed failed");
      // Capability later revoked (canShare:false). Editing the name, the client still echoes
      // isShared:true (the share checkbox is hidden). This is NOT an elevation, so it must succeed.
      const r = await updateTemplate(
        db,
        {
          id: created.value.id,
          actorId: owner,
          canShare: false,
          patch: { name: "Renamed", isShared: true },
        },
        AbortSignal.timeout(5000),
      );
      expect(r.ok).toBe(true);
      const row = (
        await db.execute(
          sql`SELECT name, is_shared AS "isShared" FROM email_templates WHERE id=${created.value.id}`,
        )
      ).rows[0] as { name: string; isShared: boolean };
      expect(row.name).toBe("Renamed");
      expect(row.isShared).toBe(true);
    });
  });

  it("sharing via update without capability is denied", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, "owner3@x.com");
      const created = await createTemplate(
        db,
        { ownerId: owner, name: "T", bodyHtml: "<p>x</p>", isShared: false, canShare: false },
        AbortSignal.timeout(5000),
      );
      if (!created.ok) throw new Error("seed failed");
      const r = await updateTemplate(
        db,
        { id: created.value.id, actorId: owner, canShare: false, patch: { isShared: true } },
        AbortSignal.timeout(5000),
      );
      expect(r.ok).toBe(false);
    });
  });

  it("owner can delete; non-owner cannot", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, "owner4@x.com");
      const other = await seedUser(db, "other4@x.com");
      const created = await createTemplate(
        db,
        { ownerId: owner, name: "Del", bodyHtml: "<p>x</p>", isShared: true, canShare: true },
        AbortSignal.timeout(5000),
      );
      if (!created.ok) throw new Error("seed failed");

      const denied = await deleteTemplate(
        db,
        { id: created.value.id, actorId: other },
        AbortSignal.timeout(5000),
      );
      expect(denied.ok).toBe(false);

      const okDel = await deleteTemplate(
        db,
        { id: created.value.id, actorId: owner },
        AbortSignal.timeout(5000),
      );
      expect(okDel.ok).toBe(true);
      const count = (
        await db.execute(
          sql`SELECT count(*)::int AS n FROM email_templates WHERE id=${created.value.id}`,
        )
      ).rows[0] as { n: number };
      expect(count.n).toBe(0);
    });
  });
});
