import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import { resolveMailLabelChips } from "./mailLabelResolve";
import {
  createMailLabel,
  findUnknownMailLabelKeys,
  listMailLabels,
  slugifyMailLabelKey,
} from "./mailLabelsRepo";
import { setThreadLabels } from "./threadAttributes";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];
const SIG = (): AbortSignal => AbortSignal.timeout(8000);
const actorOf = (id: string): AuthUser => ({
  id,
  type: "regular",
  isActive: true,
  groupIds: new Set(),
});

async function seedThread(db: TestDb, ownerId: string): Promise<string> {
  const acct = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${ownerId}, 'o@gunsnation.com') RETURNING id`,
    )
  ).rows[0] as { id: string };
  const t = (
    await db.execute(
      sql`INSERT INTO email_threads (gmail_thread_id, account_id, subject, last_message_at) VALUES ('t1', ${acct.id}, 'S', now()) RETURNING id`,
    )
  ).rows[0] as { id: string };
  return t.id;
}

describe("mail label catalog (migration 0055)", () => {
  it("seeds the three built-in mail labels with their historic keys + colors", async () => {
    await withTestDb(async (db) => {
      const catalog = await listMailLabels(db, SIG());
      const byKey = new Map(catalog.map((l) => [l.key, l]));
      expect(byKey.get("important")).toMatchObject({ name: "Important", color: "red" });
      expect(byKey.get("to_do")).toMatchObject({ name: "To do", color: "orange" });
      expect(byKey.get("later")).toMatchObject({ name: "Later", color: "blue" });
    });
  });
});

describe("createMailLabel", () => {
  it("persists a new catalog row keyed by a slug of the name", async () => {
    await withTestDb(async (db) => {
      const r = await createMailLabel(db, { name: "Newsletter", color: "green" }, SIG());
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.key).toBe("newsletter");
      const found = (await listMailLabels(db, SIG())).find((l) => l.key === "newsletter");
      expect(found).toMatchObject({ name: "Newsletter", color: "green" });
    });
  });

  it("dedupes a duplicate name (case/spacing-insensitive) to the existing row", async () => {
    await withTestDb(async (db) => {
      const first = await createMailLabel(db, { name: "Follow Up", color: "teal" }, SIG());
      expect(first.ok).toBe(true);
      const dup = await createMailLabel(db, { name: "  follow  up ", color: "red" }, SIG());
      expect(dup.ok).toBe(true);
      if (!first.ok || !dup.ok) return;
      expect(dup.value.id).toBe(first.value.id);
      expect(dup.value.color).toBe("teal"); // keeps the original, does not overwrite
      const count = (await listMailLabels(db, SIG())).filter((l) => l.key === "follow_up").length;
      expect(count).toBe(1);
    });
  });

  it("slugifyMailLabelKey collapses spaces/case/punctuation", () => {
    expect(slugifyMailLabelKey("To Do")).toBe("to_do");
    expect(slugifyMailLabelKey("  Hot Lead! ")).toBe("hot_lead");
  });
});

describe("findUnknownMailLabelKeys", () => {
  it("returns only keys with no catalog row, case-insensitively, and [] for empty input", async () => {
    await withTestDb(async (db) => {
      await createMailLabel(db, { name: "VIP", color: "purple" }, SIG());
      // "IMPORTANT" (built-in, different case) and "vip" are known; "ghost" is not.
      const missing = await findUnknownMailLabelKeys(db, ["IMPORTANT", "vip", "ghost"], SIG());
      expect(missing).toEqual(["ghost"]);
      expect(await findUnknownMailLabelKeys(db, [], SIG())).toEqual([]);
    });
  });
});

describe("applying + removing a catalog mail label on a thread", () => {
  it("persists the applied key and a later replace removes it", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const threadId = await seedThread(db, owner.id);
      const actor = actorOf(owner.id);
      const created = await createMailLabel(db, { name: "VIP", color: "purple" }, SIG());
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const applied = await setThreadLabels(
        db,
        { actor, threadId, labels: [created.value.key, "important"] },
        SIG(),
      );
      expect(applied.ok).toBe(true);
      let row = (await db.execute(sql`SELECT labels FROM email_threads WHERE id=${threadId}`))
        .rows[0] as { labels: string[] };
      expect(row.labels).toEqual(["vip", "important"]);

      const removed = await setThreadLabels(db, { actor, threadId, labels: ["important"] }, SIG());
      expect(removed.ok).toBe(true);
      row = (await db.execute(sql`SELECT labels FROM email_threads WHERE id=${threadId}`))
        .rows[0] as { labels: string[] };
      expect(row.labels).toEqual(["important"]);
    });
  });
});

describe("no data loss: legacy token labels resolve to catalog entries", () => {
  it("existing important/to_do/later thread labels render as the seeded catalog chips", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const threadId = await seedThread(db, owner.id);
      // Simulate a pre-migration thread that stored the raw follow-up tokens.
      await db.execute(
        sql`UPDATE email_threads SET labels = ARRAY['important','to_do','later']::text[] WHERE id=${threadId}`,
      );
      const stored = (await db.execute(sql`SELECT labels FROM email_threads WHERE id=${threadId}`))
        .rows[0] as { labels: string[] };
      const catalog = await listMailLabels(db, SIG());
      const chips = resolveMailLabelChips(catalog, stored.labels);
      expect(chips.map((c) => c.name)).toEqual(["Important", "To do", "Later"]);
    });
  });
});
