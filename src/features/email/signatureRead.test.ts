// signatureRead.test.ts: real-DB tests for listSignatures returning bodyHtml (Task 4.1)
// RED: fails until listSignatures returns bodyHtml
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { listSignatures } from "./emailReads";

type Db = Parameters<Parameters<typeof withTestDb>[0]>[0];

async function seedSignature(
  db: Db,
  opts: {
    userId: string;
    name?: string;
    bodyHtml?: string;
    isDefault?: boolean;
  },
): Promise<string> {
  const r = (
    await db.execute(sql`
      INSERT INTO signatures (user_id, name, body_html, is_default)
      VALUES (
        ${opts.userId},
        ${opts.name ?? "My Sig"},
        ${opts.bodyHtml ?? "<p>-- John</p>"},
        ${opts.isDefault ?? false}
      ) RETURNING id
    `)
  ).rows[0] as { id: string };
  return r.id;
}

describe("listSignatures (with bodyHtml)", () => {
  it("returns bodyHtml for each signature", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      await seedSignature(db, { userId: user.id, bodyHtml: "<p>-- Alice</p>" });
      const actor = {
        id: user.id,
        type: "regular" as const,
        isActive: true,
        groupIds: new Set<string>(),
      };

      const sigs = await listSignatures(db, { actor }, AbortSignal.timeout(5000));

      expect(sigs.length).toBeGreaterThanOrEqual(1);
      const sig = sigs[0];
      expect(sig).toBeDefined();
      if (sig === undefined) return;
      expect(typeof sig.bodyHtml).toBe("string");
      expect(sig.bodyHtml).toContain("Alice");
    });
  });

  it("sanitises disallowed tags from signature bodyHtml", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      await seedSignature(db, {
        userId: user.id,
        bodyHtml: "<p>Safe sig</p><script>evil()</script>",
      });
      const actor = {
        id: user.id,
        type: "regular" as const,
        isActive: true,
        groupIds: new Set<string>(),
      };

      const sigs = await listSignatures(db, { actor }, AbortSignal.timeout(5000));

      const sig = sigs[0];
      expect(sig).toBeDefined();
      if (sig === undefined) return;
      expect(sig.bodyHtml).not.toContain("<script>");
      expect(sig.bodyHtml).toContain("Safe sig");
    });
  });

  it("returns isDefault=true for the default signature", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      await seedSignature(db, { userId: user.id, name: "Default", isDefault: true });
      await seedSignature(db, { userId: user.id, name: "Other", isDefault: false });
      const actor = {
        id: user.id,
        type: "regular" as const,
        isActive: true,
        groupIds: new Set<string>(),
      };

      const sigs = await listSignatures(db, { actor }, AbortSignal.timeout(5000));

      // Default comes first (ORDER BY is_default DESC)
      const first = sigs[0];
      expect(first).toBeDefined();
      if (first === undefined) return;
      expect(first.isDefault).toBe(true);
    });
  });

  it("only returns signatures belonging to the actor, not other users' signatures", async () => {
    await withTestDb(async (db) => {
      const actor = await seedUser(db);
      const other = await seedUser(db);
      // Seed a sig for actor AND one for the other user
      const actorSigId = await seedSignature(db, { userId: actor.id, name: "Actor sig" });
      await seedSignature(db, { userId: other.id, name: "Other user sig" });
      const actorObj = {
        id: actor.id,
        type: "regular" as const,
        isActive: true,
        groupIds: new Set<string>(),
      };

      const sigs = await listSignatures(db, { actor: actorObj }, AbortSignal.timeout(5000));

      // Actor sees only their own signature, not the other user's
      expect(sigs.length).toBe(1);
      expect(sigs[0]?.id).toBe(actorSigId);
    });
  });
});
