import { eq, sql } from "drizzle-orm";
import { PgBoss } from "pg-boss";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH } from "@/constants/jobNames";
import { deals } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedWorld } from "@/features/search/search.test-helpers";
import { setBoss } from "@/jobs/boss";
import { makeTestDb } from "@/test/db";
import {
  dealsForContacts,
  dealsForConversations,
  dealsForPersons,
  dealsWithIntercomContacts,
} from "./affected";
import {
  addParticipantRow,
  conversationFor,
  linkedDeal,
  MAYA_EMAIL,
  setContactEmail,
} from "./dealSearch.test-helpers";
import { enqueueDealSearchRefresh } from "./enqueue";
import { DEAL_SEARCH_REFRESH_QUEUE_OPTIONS } from "./job";
import { refreshDealIntercomSearch } from "./refresh";

const signal = () => new AbortController().signal;

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
let boss: PgBoss;

beforeAll(async () => {
  ctx = await makeTestDb();
  boss = new PgBoss(ctx.url);
  await boss.start();
  await boss.createQueue(PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH, DEAL_SEARCH_REFRESH_QUEUE_OPTIONS);
});

afterAll(async () => {
  await boss.stop();
  await ctx.close();
});

afterEach(async () => {
  setBoss(null as unknown as PgBoss);
  vi.restoreAllMocks();
  await ctx.pool.query("DELETE FROM pgboss.job WHERE name = $1", [
    PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH,
  ]);
});

async function queuedDealIds(): Promise<string[]> {
  const r = await ctx.pool.query<{ k: string }>(
    "SELECT data->>'dealId' AS k FROM pgboss.job WHERE name = $1 AND state = 'created' ORDER BY 1",
    [PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH],
  );
  return r.rows.map((row) => row.k);
}

describe("enqueueDealSearchRefresh", () => {
  it("is invisible to other connections until the outer transaction commits", async () => {
    setBoss(boss);
    await ctx.db.transaction(async (tx) => {
      await enqueueDealSearchRefresh(tx, ["d1", "d2"], signal());
      expect(await queuedDealIds()).toEqual([]);
    });
    expect(await queuedDealIds()).toEqual(["d1", "d2"]);
  });

  it("enqueues nothing when the outer transaction rolls back", async () => {
    setBoss(boss);
    await expect(
      ctx.db.transaction(async (tx) => {
        await enqueueDealSearchRefresh(tx, ["d1"], signal());
        throw new Error("mutation failed");
      }),
    ).rejects.toThrow("mutation failed");
    expect(await queuedDealIds()).toEqual([]);
  });

  it("publishes one job per enqueue so each committed mutation has its own refresh", async () => {
    setBoss(boss);
    await enqueueDealSearchRefresh(ctx.db, ["d1", "d1"], signal());
    await enqueueDealSearchRefresh(ctx.db, ["d1"], signal());
    expect(await queuedDealIds()).toEqual(["d1", "d1"]);
  });

  it("does nothing without deals or without a boss", async () => {
    setBoss(boss);
    await enqueueDealSearchRefresh(ctx.db, [], signal());
    expect(await queuedDealIds()).toEqual([]);
    setBoss(null as unknown as PgBoss);
    await expect(enqueueDealSearchRefresh(ctx.db, ["d1"], signal())).resolves.toBeUndefined();
  });

  it("logs a failed send and leaves the caller's transaction usable", async () => {
    setBoss(boss);
    vi.spyOn(boss, "send").mockRejectedValue(new Error("down"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await ctx.db.transaction(async (tx) => {
      await expect(enqueueDealSearchRefresh(tx, ["d1", "d2"], signal())).resolves.toBeUndefined();
      await tx.execute(sql`SELECT 1`);
    });
    expect(log).toHaveBeenCalled();
  });

  it("a failing statement inside the send does not abort the caller's transaction", async () => {
    setBoss(boss);
    vi.spyOn(boss, "send").mockImplementation(async (...args: unknown[]) => {
      const options = args[2] as { db: { executeSql: (t: string) => Promise<unknown> } };
      await options.db.executeSql("SELECT * FROM does_not_exist");
      return null;
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await ctx.db.transaction(async (tx) => {
      await enqueueDealSearchRefresh(tx, ["d1"], signal());
      await tx.execute(sql`SELECT 1`);
    });
  });
});

describe("deals with linked Intercom contacts", () => {
  it("lists non-deleted deals whose person or participant matches a contact email", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const direct = await linkedDeal(db, w, "direct@acme.com");
      const viaParticipant = await linkedDeal(db, w, "nobody@acme.com");
      const other = await linkedDeal(db, w, "part@acme.com");
      await addParticipantRow(db, viaParticipant.dealId, other.personId);
      const deleted = await linkedDeal(db, w, "gone@acme.com");
      await linkedDeal(db, w, "unmatched@acme.com");
      await conversationFor(db, "c1", "direct@acme.com");
      await conversationFor(db, "c2", "part@acme.com");
      await conversationFor(db, "c3", "gone@acme.com");
      await db.update(deals).set({ deletedAt: new Date() }).where(eq(deals.id, deleted.dealId));
      expect((await dealsWithIntercomContacts(db, signal())).sort()).toEqual(
        [direct.dealId, viaParticipant.dealId, other.dealId].sort(),
      );
    });
  });
});

describe("affected deals", () => {
  it("finds deals of persons whose email matches a conversation contact", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const a = await linkedDeal(db, w);
      const b = await linkedDeal(db, w, "viaparticipant@acme.com");
      await addParticipantRow(db, a.dealId, b.personId);
      await linkedDeal(db, w, "unrelated@acme.com");
      await conversationFor(db, "c1", "viaparticipant@acme.com");
      await conversationFor(db, "c2", "noreply@acme.com");
      expect((await dealsForConversations(db, ["c1"], signal())).sort()).toEqual(
        [a.dealId, b.dealId].sort(),
      );
      expect(await dealsForConversations(db, ["c2"], signal())).toEqual([]);
      expect(await dealsForConversations(db, [], signal())).toEqual([]);
    });
  });

  it("finds former and new deals when a contact email changes", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const former = await linkedDeal(db, w);
      const next = await linkedDeal(db, w, "next@acme.com");
      await conversationFor(db, "c1", MAYA_EMAIL);
      await refreshDealIntercomSearch(db, [former.dealId], signal());
      await setContactEmail(db, "c1-k0", "next@acme.com");
      expect((await dealsForContacts(db, ["c1-k0"], signal())).sort()).toEqual(
        [former.dealId, next.dealId].sort(),
      );
    });
  });

  it("finds the non-deleted deals of persons", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const a = await linkedDeal(db, w);
      const b = await linkedDeal(db, w, "b@acme.com");
      await addParticipantRow(db, b.dealId, a.personId);
      expect((await dealsForPersons(db, [a.personId], signal())).sort()).toEqual(
        [a.dealId, b.dealId].sort(),
      );
      expect(await dealsForPersons(db, [], signal())).toEqual([]);
    });
  });
});
