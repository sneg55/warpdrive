import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { withTestDb } from "@/db/testing";
import { seedUser as seedUserRow } from "@/db/testing/factories";
import {
  createSignature,
  deleteSignature,
  setDefaultSignature,
  updateSignature,
} from "./authoring";

type Db = Parameters<Parameters<typeof withTestDb>[0]>[0];

async function seedUser(db: Db, label?: string): Promise<string> {
  return (await seedUserRow(db, label !== undefined ? { email: label } : undefined)).id;
}

describe("updateSignature / deleteSignature", () => {
  it("owner updates name/body (sanitized); non-owner denied E_PERM_004", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db, "sig-owner@x.com");
      const other = await seedUser(db, "sig-other@x.com");
      const created = await createSignature(
        db,
        { userId: me, name: "Sig", bodyHtml: "<p>old</p>", isDefault: false },
        AbortSignal.timeout(5000),
      );
      if (!created.ok) throw new Error("seed failed");

      const denied = await updateSignature(
        db,
        { id: created.value.id, userId: other, patch: { name: "x" } },
        AbortSignal.timeout(5000),
      );
      expect(denied.ok).toBe(false);
      if (!denied.ok) expect(denied.error.id).toBe(ERROR_IDS.PERM_SIGNATURE_DENIED);

      const okUpd = await updateSignature(
        db,
        { id: created.value.id, userId: me, patch: { bodyHtml: '<p onclick="x()">new</p>' } },
        AbortSignal.timeout(5000),
      );
      expect(okUpd.ok).toBe(true);
      const row = (
        await db.execute(
          sql`SELECT body_html AS "bodyHtml" FROM signatures WHERE id=${created.value.id}`,
        )
      ).rows[0] as { bodyHtml: string };
      expect(row.bodyHtml).not.toContain("onclick");
    });
  });

  it("setting isDefault:true via update leaves exactly one default", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db, "sig-def@x.com");
      const a = await createSignature(
        db,
        { userId: me, name: "A", bodyHtml: "<p>a</p>", isDefault: true },
        AbortSignal.timeout(5000),
      );
      const b = await createSignature(
        db,
        { userId: me, name: "B", bodyHtml: "<p>b</p>", isDefault: false },
        AbortSignal.timeout(5000),
      );
      if (!a.ok || !b.ok) throw new Error("seed failed");

      const r = await updateSignature(
        db,
        { id: b.value.id, userId: me, patch: { isDefault: true } },
        AbortSignal.timeout(5000),
      );
      expect(r.ok).toBe(true);
      const n = (
        await db.execute(
          sql`SELECT count(*)::int AS n FROM signatures WHERE user_id=${me} AND is_default=true`,
        )
      ).rows[0] as { n: number };
      expect(n.n).toBe(1);
    });
  });

  it("SECURITY: a denied isDefault update does not clear the caller's own default", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db, "sig-keepdef@x.com");
      const other = await seedUser(db, "sig-keepdef-other@x.com");
      const mine = await createSignature(
        db,
        { userId: me, name: "Mine", bodyHtml: "<p>m</p>", isDefault: true },
        AbortSignal.timeout(5000),
      );
      const theirs = await createSignature(
        db,
        { userId: other, name: "Theirs", bodyHtml: "<p>t</p>", isDefault: false },
        AbortSignal.timeout(5000),
      );
      if (!mine.ok || !theirs.ok) throw new Error("seed failed");

      // `me` tries to set ANOTHER user's signature as default. It must be denied AND leave
      // my own default untouched (the demotion must not run when the target is not owned).
      const denied = await updateSignature(
        db,
        { id: theirs.value.id, userId: me, patch: { isDefault: true } },
        AbortSignal.timeout(5000),
      );
      expect(denied.ok).toBe(false);
      const n = (
        await db.execute(
          sql`SELECT count(*)::int AS n FROM signatures WHERE user_id=${me} AND is_default=true`,
        )
      ).rows[0] as { n: number };
      expect(n.n).toBe(1);
    });
  });

  it("SECURITY: a denied setDefault does not clear the caller's own default", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db, "sig-setdef@x.com");
      const other = await seedUser(db, "sig-setdef-other@x.com");
      const mine = await createSignature(
        db,
        { userId: me, name: "Mine", bodyHtml: "<p>m</p>", isDefault: true },
        AbortSignal.timeout(5000),
      );
      const theirs = await createSignature(
        db,
        { userId: other, name: "Theirs", bodyHtml: "<p>t</p>", isDefault: false },
        AbortSignal.timeout(5000),
      );
      if (!mine.ok || !theirs.ok) throw new Error("seed failed");

      const denied = await setDefaultSignature(
        db,
        { userId: me, signatureId: theirs.value.id },
        AbortSignal.timeout(5000),
      );
      expect(denied.ok).toBe(false);
      const n = (
        await db.execute(
          sql`SELECT count(*)::int AS n FROM signatures WHERE user_id=${me} AND is_default=true`,
        )
      ).rows[0] as { n: number };
      expect(n.n).toBe(1);
    });
  });

  it("owner deletes; non-owner cannot", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db, "sig-del@x.com");
      const other = await seedUser(db, "sig-del-other@x.com");
      const created = await createSignature(
        db,
        { userId: me, name: "D", bodyHtml: "<p>x</p>", isDefault: false },
        AbortSignal.timeout(5000),
      );
      if (!created.ok) throw new Error("seed failed");

      const denied = await deleteSignature(
        db,
        { id: created.value.id, userId: other },
        AbortSignal.timeout(5000),
      );
      expect(denied.ok).toBe(false);
      const okDel = await deleteSignature(
        db,
        { id: created.value.id, userId: me },
        AbortSignal.timeout(5000),
      );
      expect(okDel.ok).toBe(true);
    });
  });
});
