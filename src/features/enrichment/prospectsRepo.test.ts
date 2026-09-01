import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { PROSPECT_RESUME_WINDOW_MS } from "@/constants/prospectSearch";
import type { Db } from "@/db/client";
import { organizations, persons, prospectReveals } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import {
  findResumableBatch,
  getOwnBatch,
  getOwnUnappliedBatch,
  insertReveals,
  markRevealApplied,
} from "./prospectsRepo";
import type { ProspectProfile } from "./providers/types";

const signal = new AbortController().signal;
const NOW = new Date("2026-08-31T12:00:00.000Z");

function constraintOf(error: unknown): string | null {
  for (let cur: unknown = error, d = 0; d < 5 && typeof cur === "object" && cur !== null; d += 1) {
    const constraint = "constraint" in cur ? cur.constraint : undefined;
    if (typeof constraint === "string") return constraint;
    cur = "cause" in cur ? cur.cause : undefined;
  }
  return null;
}

function profileOf(fullName: string): ProspectProfile {
  return { providerRef: "ref-1", fullName, hasEmail: true, hasPhone: false };
}

async function seedOrg(db: Db, ownerId: string): Promise<string> {
  const [row] = await db
    .insert(organizations)
    .values({ name: `Org ${Math.random()}`, ownerId, visibilityLevel: "all" })
    .returning({ id: organizations.id });
  if (row === undefined) throw new Error("no organization row");
  return row.id;
}

function revealRow(
  orgId: string,
  requestedBy: string,
  batchId: string,
  providerRef: string,
  createdAt?: Date,
): typeof prospectReveals.$inferInsert {
  return {
    batchId,
    orgId,
    requestedBy,
    providerRef,
    searchProvider: "apollo",
    profile: { ...profileOf("Ada Lovelace"), providerRef },
    outcomes: [],
    ...(createdAt === undefined ? {} : { createdAt }),
  };
}

const BATCH_A = "11111111-1111-4111-8111-111111111111";
const BATCH_B = "22222222-2222-4222-8222-222222222222";

describe("insertReveals", () => {
  it("writes the rows it is given", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const orgId = await seedOrg(db, user.id);

      await insertReveals(
        db,
        [revealRow(orgId, user.id, BATCH_A, "a"), revealRow(orgId, user.id, BATCH_A, "b")],
        signal,
      );

      const rows = await db.select().from(prospectReveals);
      expect(rows.map((r) => r.providerRef).sort()).toEqual(["a", "b"]);
    });
  });

  it("refuses a duplicate provider ref inside the same batch", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const orgId = await seedOrg(db, user.id);
      await insertReveals(db, [revealRow(orgId, user.id, BATCH_A, "a")], signal);

      const error = await insertReveals(
        db,
        [revealRow(orgId, user.id, BATCH_A, "a")],
        signal,
      ).catch((e: unknown) => e);

      expect(constraintOf(error)).toBe("prospect_reveal_batch_ref_unique");
    });
  });
});

describe("getOwnBatch", () => {
  it("returns only the rows of that batch, organization and requester", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const other = await seedUser(db);
      const orgId = await seedOrg(db, user.id);
      const otherOrgId = await seedOrg(db, user.id);
      await insertReveals(
        db,
        [
          revealRow(orgId, user.id, BATCH_A, "a"),
          revealRow(orgId, user.id, BATCH_B, "b"),
          revealRow(otherOrgId, user.id, BATCH_A, "c"),
          revealRow(orgId, other.id, BATCH_A, "d"),
        ],
        signal,
      );

      const rows = await getOwnBatch(db, BATCH_A, orgId, user.id, signal);

      expect(rows.map((r) => r.providerRef)).toEqual(["a"]);
    });
  });
});

describe("getOwnUnappliedBatch", () => {
  it("excludes a row already stamped applied", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const orgId = await seedOrg(db, user.id);
      const [person] = await db
        .insert(persons)
        .values({ name: "Ada Lovelace", ownerId: user.id, visibilityLevel: "all", orgId })
        .returning({ id: persons.id });
      if (person === undefined) throw new Error("no person row");
      await insertReveals(
        db,
        [revealRow(orgId, user.id, BATCH_A, "a"), revealRow(orgId, user.id, BATCH_A, "b")],
        signal,
      );
      const stored = await getOwnBatch(db, BATCH_A, orgId, user.id, signal);
      const applied = stored.find((row) => row.providerRef === "a");
      if (applied === undefined) throw new Error("no reveal row");
      await markRevealApplied(db, applied.id, person.id, NOW, signal);

      const rows = await getOwnUnappliedBatch(db, BATCH_A, orgId, user.id, signal);

      expect(rows.map((r) => r.providerRef)).toEqual(["b"]);
    });
  });
});

describe("findResumableBatch", () => {
  it("returns the newest batch holding an unapplied row", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const orgId = await seedOrg(db, user.id);
      const old = new Date(NOW.getTime() - 60_000);
      await insertReveals(
        db,
        [
          revealRow(orgId, user.id, BATCH_A, "a", old),
          revealRow(orgId, user.id, BATCH_B, "b", NOW),
          revealRow(orgId, user.id, BATCH_B, "c", NOW),
        ],
        signal,
      );

      const found = await findResumableBatch(db, orgId, user.id, NOW, signal);

      expect(found).toEqual({ batchId: BATCH_B, count: 2 });
    });
  });

  it("returns null when every row is applied", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const orgId = await seedOrg(db, user.id);
      await insertReveals(db, [revealRow(orgId, user.id, BATCH_A, "a", NOW)], signal);
      await db.update(prospectReveals).set({ appliedAt: NOW });

      expect(await findResumableBatch(db, orgId, user.id, NOW, signal)).toBeNull();
    });
  });

  it("returns null when the newest batch is older than the resume window", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const orgId = await seedOrg(db, user.id);
      const stale = new Date(NOW.getTime() - PROSPECT_RESUME_WINDOW_MS - 60_000);
      await insertReveals(db, [revealRow(orgId, user.id, BATCH_A, "a", stale)], signal);

      expect(await findResumableBatch(db, orgId, user.id, NOW, signal)).toBeNull();
    });
  });

  it("never returns a batch requested by another user", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const other = await seedUser(db);
      const orgId = await seedOrg(db, user.id);
      await insertReveals(db, [revealRow(orgId, other.id, BATCH_A, "a", NOW)], signal);

      expect(await findResumableBatch(db, orgId, user.id, NOW, signal)).toBeNull();
    });
  });
});

describe("markRevealApplied", () => {
  it("stamps the person and the applied time", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const orgId = await seedOrg(db, user.id);
      const [person] = await db
        .insert(persons)
        .values({ name: "Ada Lovelace", ownerId: user.id, visibilityLevel: "all", orgId })
        .returning({ id: persons.id });
      if (person === undefined) throw new Error("no person row");
      await insertReveals(db, [revealRow(orgId, user.id, BATCH_A, "a", NOW)], signal);
      const [reveal] = await getOwnBatch(db, BATCH_A, orgId, user.id, signal);
      if (reveal === undefined) throw new Error("no reveal row");

      await markRevealApplied(db, reveal.id, person.id, NOW, signal);

      const [row] = await db
        .select()
        .from(prospectReveals)
        .where(eq(prospectReveals.id, reveal.id));
      expect(row?.personId).toBe(person.id);
      expect(row?.appliedAt?.toISOString()).toBe(NOW.toISOString());
    });
  });
});
