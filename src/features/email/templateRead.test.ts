// templateRead.test.ts: real-DB tests for getTemplate (Task 4.1)
// RED: fails until getTemplate is implemented in emailReads.ts
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { getTemplate } from "./emailReads";

type Db = Parameters<Parameters<typeof withTestDb>[0]>[0];

async function seedTemplate(
  db: Db,
  opts: {
    ownerId: string;
    name?: string;
    subject?: string;
    bodyHtml?: string;
    isShared?: boolean;
  },
): Promise<string> {
  const r = (
    await db.execute(sql`
      INSERT INTO email_templates (name, subject, body_html, owner_id, is_shared)
      VALUES (
        ${opts.name ?? "Test Template"},
        ${opts.subject ?? "Hello Subject"},
        ${opts.bodyHtml ?? "<p>Hello body</p>"},
        ${opts.ownerId},
        ${opts.isShared ?? false}
      ) RETURNING id
    `)
  ).rows[0] as { id: string };
  return r.id;
}

describe("getTemplate", () => {
  it("returns sanitised bodyHtml + subject when the actor owns the template", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const id = await seedTemplate(db, {
        ownerId: user.id,
        subject: "My Subject",
        bodyHtml: "<p>Hello <strong>world</strong></p>",
      });
      const actor = {
        id: user.id,
        type: "regular" as const,
        isActive: true,
        groupIds: new Set<string>(),
      };

      const r = await getTemplate(db, { id, actor }, AbortSignal.timeout(5000));

      expect(r.ok).toBe(true);
      if (r.ok !== true) return;
      expect(r.value.id).toBe(id);
      expect(r.value.subject).toBe("My Subject");
      expect(r.value.bodyHtml).toContain("<p>");
      expect(r.value.bodyHtml).toContain("Hello");
    });
  });

  it("returns the template when it is shared (is_shared=true), even for a non-owner", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const id = await seedTemplate(db, {
        ownerId: owner.id,
        isShared: true,
        bodyHtml: "<p>Shared</p>",
      });
      const actor = {
        id: other.id,
        type: "regular" as const,
        isActive: true,
        groupIds: new Set<string>(),
      };

      const r = await getTemplate(db, { id, actor }, AbortSignal.timeout(5000));

      expect(r.ok).toBe(true);
      if (r.ok !== true) return;
      expect(r.value.bodyHtml).toContain("Shared");
    });
  });

  it("denies (E_PERM_005) when the actor neither owns nor the template is shared", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const id = await seedTemplate(db, {
        ownerId: owner.id,
        isShared: false,
        bodyHtml: "<p>Private</p>",
      });
      const actor = {
        id: other.id,
        type: "regular" as const,
        isActive: true,
        groupIds: new Set<string>(),
      };

      const r = await getTemplate(db, { id, actor }, AbortSignal.timeout(5000));

      expect(r.ok).toBe(false);
      if (r.ok !== false) return;
      expect(r.error.id).toBe("E_PERM_005");
    });
  });

  it("denies (E_PERM_005) for an unknown template id (no existence leak)", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const actor = {
        id: user.id,
        type: "regular" as const,
        isActive: true,
        groupIds: new Set<string>(),
      };

      const r = await getTemplate(db, { id: randomUUID(), actor }, AbortSignal.timeout(5000));

      expect(r.ok).toBe(false);
      if (r.ok !== false) return;
      expect(r.error.id).toBe("E_PERM_005");
    });
  });

  it("sanitises disallowed tags from the bodyHtml", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const id = await seedTemplate(db, {
        ownerId: user.id,
        bodyHtml: '<p>Safe</p><script>alert("xss")</script>',
      });
      const actor = {
        id: user.id,
        type: "regular" as const,
        isActive: true,
        groupIds: new Set<string>(),
      };

      const r = await getTemplate(db, { id, actor }, AbortSignal.timeout(5000));

      expect(r.ok).toBe(true);
      if (r.ok !== true) return;
      expect(r.value.bodyHtml).not.toContain("<script>");
      expect(r.value.bodyHtml).toContain("Safe");
    });
  });
});
