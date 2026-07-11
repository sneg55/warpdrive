import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import { deleteDraft, listDrafts, saveDraft } from "./draftRepo";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];
const SIG = (): AbortSignal => AbortSignal.timeout(8000);
const actorOf = (id: string): AuthUser => ({
  id,
  type: "regular",
  isActive: true,
  groupIds: new Set(),
});

async function seedAccount(
  db: TestDb,
  ownerId: string,
  email = "o@gunsnation.com",
): Promise<string> {
  const acct = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${ownerId}, ${email}) RETURNING id`,
    )
  ).rows[0] as { id: string };
  return acct.id;
}

describe("draft repository", () => {
  it("saves, updates by id, lists newest-first, and deletes", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const actor = actorOf(owner.id);

      const created = await saveDraft(
        db,
        {
          actor,
          draft: {
            accountId: acctId,
            subject: "One",
            bodyHtml: "<p>1</p>",
            toEmails: ["a@y.com"],
            ccEmails: [],
          },
        },
        SIG(),
      );
      if (!created.ok) throw new Error("save failed");

      const updated = await saveDraft(
        db,
        {
          actor,
          draft: {
            id: created.value.id,
            accountId: acctId,
            subject: "One-edited",
            bodyHtml: "<p>1b</p>",
            toEmails: ["a@y.com"],
            ccEmails: ["c@y.com"],
          },
        },
        SIG(),
      );
      expect(updated.ok).toBe(true);

      await saveDraft(
        db,
        {
          actor,
          draft: {
            accountId: acctId,
            subject: "Two",
            bodyHtml: "<p>2</p>",
            toEmails: [],
            ccEmails: [],
          },
        },
        SIG(),
      );

      const list = await listDrafts(db, actor, SIG());
      expect(list).toHaveLength(2);
      const edited = list.find((d) => d.id === created.value.id);
      expect(edited?.subject).toBe("One-edited");
      expect(edited?.ccEmails).toEqual(["c@y.com"]);

      const del = await deleteDraft(db, { actor, draftId: created.value.id }, SIG());
      expect(del.ok).toBe(true);
      expect(await listDrafts(db, actor, SIG())).toHaveLength(1);
    });
  });

  it("saving a draft with a foreign/nonexistent threadId returns a Result, not an FK throw", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      // A threadId that does not exist on this mailbox: the composite FK would raise a Postgres
      // error, but the boundary must return a typed AppError instead of throwing.
      const res = await saveDraft(
        db,
        {
          actor: actorOf(owner.id),
          draft: {
            accountId: acctId,
            threadId: crypto.randomUUID(),
            subject: "Reply",
            bodyHtml: "<p>x</p>",
            toEmails: [],
            ccEmails: [],
          },
        },
        SIG(),
      );
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.id).toBe("E_GMAIL_011");
    });
  });

  it("delete of a non-owned draft returns E_GMAIL_014 (no leak)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const other = await seedUser(db, { email: "x@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id);
      const created = await saveDraft(
        db,
        {
          actor: actorOf(owner.id),
          draft: { accountId: acctId, subject: "Mine", bodyHtml: "", toEmails: [], ccEmails: [] },
        },
        SIG(),
      );
      if (!created.ok) throw new Error("save failed");
      const del = await deleteDraft(
        db,
        { actor: actorOf(other.id), draftId: created.value.id },
        SIG(),
      );
      expect(del.ok).toBe(false);
      if (!del.ok) expect(del.error.id).toBe("E_GMAIL_014");
    });
  });
});
