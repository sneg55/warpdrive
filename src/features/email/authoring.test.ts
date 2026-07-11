import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { createSignature, createTemplate, setDefaultSignature } from "./authoring";

const SIG = (): AbortSignal => AbortSignal.timeout(8000);

describe("email authoring", () => {
  it("sanitizes template HTML on save", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db, { email: "o@gunsnation.com" });
      const r = await createTemplate(
        db,
        {
          ownerId: u.id,
          name: "T",
          bodyHtml: "<b>hi</b><script>x</script>",
          isShared: false,
          canShare: true,
        },
        SIG(),
      );
      expect(r.ok).toBe(true);
      const row = (
        await db.execute(sql`SELECT body_html FROM email_templates WHERE owner_id=${u.id}`)
      ).rows[0] as { body_html: string };
      expect(row.body_html).not.toMatch(/<script/i);
      expect(row.body_html).toContain("<b>hi</b>");
    });
  });

  it("rejects sharing a template without the share capability", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db, { email: "o@gunsnation.com" });
      const r = await createTemplate(
        db,
        { ownerId: u.id, name: "T", bodyHtml: "<b>hi</b>", isShared: true, canShare: false },
        SIG(),
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.id.startsWith("E_PERM")).toBe(true);
      // No row written on the rejected share.
      const n = (
        await db.execute(sql`SELECT count(*)::int AS n FROM email_templates WHERE owner_id=${u.id}`)
      ).rows[0] as { n: number };
      expect(n.n).toBe(0);
    });
  });

  it("allows a shared template when the caller has the capability", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db, { email: "o@gunsnation.com" });
      const r = await createTemplate(
        db,
        { ownerId: u.id, name: "T", bodyHtml: "<b>hi</b>", isShared: true, canShare: true },
        SIG(),
      );
      expect(r.ok).toBe(true);
      const row = (
        await db.execute(sql`SELECT is_shared FROM email_templates WHERE owner_id=${u.id}`)
      ).rows[0] as { is_shared: boolean };
      expect(row.is_shared).toBe(true);
    });
  });

  it("enforces a single default signature per user across two default inserts", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db, { email: "o@gunsnation.com" });
      await createSignature(
        db,
        { userId: u.id, name: "A", bodyHtml: "<i>a</i>", isDefault: true },
        SIG(),
      );
      await createSignature(
        db,
        { userId: u.id, name: "B", bodyHtml: "<i>b</i>", isDefault: true },
        SIG(),
      );
      const defaults = (
        await db.execute(
          sql`SELECT count(*)::int AS n FROM signatures WHERE user_id=${u.id} AND is_default`,
        )
      ).rows[0] as { n: number };
      expect(defaults.n).toBe(1);
    });
  });

  it("setDefaultSignature moves the default to the chosen signature", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db, { email: "o@gunsnation.com" });
      const a = await createSignature(
        db,
        { userId: u.id, name: "A", bodyHtml: "<i>a</i>", isDefault: true },
        SIG(),
      );
      const b = await createSignature(
        db,
        { userId: u.id, name: "B", bodyHtml: "<i>b</i>", isDefault: false },
        SIG(),
      );
      expect(a.ok && b.ok).toBe(true);
      if (!b.ok) return;

      const moved = await setDefaultSignature(db, { userId: u.id, signatureId: b.value.id }, SIG());
      expect(moved.ok).toBe(true);

      const def = (
        await db.execute(sql`SELECT id FROM signatures WHERE user_id=${u.id} AND is_default`)
      ).rows[0] as { id: string };
      expect(def.id).toBe(b.value.id);
      const n = (
        await db.execute(
          sql`SELECT count(*)::int AS n FROM signatures WHERE user_id=${u.id} AND is_default`,
        )
      ).rows[0] as { n: number };
      expect(n.n).toBe(1);
    });
  });
});
