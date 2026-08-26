import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { searchAll } from "./query";

function makeActor(id: string): PermSetUser {
  return { id, type: "regular", isActive: true, flags: new Set(), groupIds: new Set() };
}

async function searchOrgs(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  actorId: string,
  q: string,
): Promise<string[]> {
  const r = await searchAll(db, makeActor(actorId), q, new AbortController().signal);
  if (r.ok === false) throw new Error(r.error.message);
  return r.value.organizations.map((o) => o.primary);
}

describe("organization search by domain", () => {
  it("finds an organization by the exact domain it holds", async () => {
    await withTestDb(async (db) => {
      const alice = await seedUser(db);
      await db.insert(schema.organizations).values({
        name: "Pioneer Valley Transit",
        domain: "pvta.com",
        ownerId: alice.id,
        visibilityLevel: "all",
      });

      expect(await searchOrgs(db, alice.id, "pvta.com")).toContain("Pioneer Valley Transit");
    });
  });

  it("matches a stored scheme-and-www domain against a bare domain query", async () => {
    await withTestDb(async (db) => {
      const alice = await seedUser(db);
      await db.insert(schema.organizations).values({
        name: "Pioneer Valley Transit",
        domain: "https://www.pvta.com/",
        ownerId: alice.id,
        visibilityLevel: "all",
      });

      expect(await searchOrgs(db, alice.id, "pvta.com")).toContain("Pioneer Valley Transit");
    });
  });

  it("matches a bare stored domain against a scheme-and-www query", async () => {
    await withTestDb(async (db) => {
      const alice = await seedUser(db);
      await db.insert(schema.organizations).values({
        name: "Pioneer Valley Transit",
        domain: "pvta.com",
        ownerId: alice.id,
        visibilityLevel: "all",
      });

      expect(await searchOrgs(db, alice.id, "https://www.PVTA.com/")).toContain(
        "Pioneer Valley Transit",
      );
    });
  });

  it("finds the organization when the query is an email address at its domain", async () => {
    await withTestDb(async (db) => {
      const alice = await seedUser(db);
      await db.insert(schema.organizations).values({
        name: "Pioneer Valley Transit",
        domain: "pvta.com",
        ownerId: alice.id,
        visibilityLevel: "all",
      });

      expect(await searchOrgs(db, alice.id, "jane@pvta.com")).toContain("Pioneer Valley Transit");
    });
  });

  it("does not return an organization whose domain merely shares a label", async () => {
    await withTestDb(async (db) => {
      const alice = await seedUser(db);
      await db.insert(schema.organizations).values({
        name: "Pioneer Valley Transit",
        domain: "pvta.com",
        ownerId: alice.id,
        visibilityLevel: "all",
      });
      await db.insert(schema.organizations).values({
        name: "Other Co",
        domain: "pvta.org",
        ownerId: alice.id,
        visibilityLevel: "all",
      });

      const names = await searchOrgs(db, alice.id, "pvta.com");
      expect(names).toContain("Pioneer Valley Transit");
      expect(names).not.toContain("Other Co");
    });
  });

  it("keeps a domain match out of reach of a user who cannot see the organization", async () => {
    await withTestDb(async (db) => {
      const alice = await seedUser(db);
      const bob = await seedUser(db);
      await db.insert(schema.organizations).values({
        name: "Pioneer Valley Transit",
        domain: "pvta.com",
        ownerId: bob.id,
        visibilityLevel: "owner",
      });

      expect(await searchOrgs(db, alice.id, "pvta.com")).not.toContain("Pioneer Valley Transit");
    });
  });

  it("returns the domain as the secondary line so the match is explicable", async () => {
    await withTestDb(async (db) => {
      const alice = await seedUser(db);
      await db.insert(schema.organizations).values({
        name: "Pioneer Valley Transit",
        domain: "pvta.com",
        ownerId: alice.id,
        visibilityLevel: "all",
      });

      const r = await searchAll(db, makeActor(alice.id), "pvta.com", new AbortController().signal);
      if (r.ok === false) throw new Error(r.error.message);
      expect(r.value.organizations[0]?.secondary).toBe("pvta.com");
    });
  });

  // Rebuilding a generated column means dropping it, which drops its indexes. drizzle-kit does not
  // re-emit them, so pin the index here: losing it turns every org search into a sequential scan.
  it("keeps the GIN index on search_tsv after the migrations run", async () => {
    await withTestDb(async (db) => {
      const r = (await db.execute(
        sql`SELECT indexdef FROM pg_indexes WHERE tablename = 'organizations' AND indexname = 'org_search_idx'`,
      )) as unknown as { rows: { indexdef: string }[] };
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0]?.indexdef).toContain("gin");
      expect(r.rows[0]?.indexdef).toContain("search_tsv");
    });
  });

  it("still finds an organization by name when it holds no domain", async () => {
    await withTestDb(async (db) => {
      const alice = await seedUser(db);
      await db.insert(schema.organizations).values({
        name: "Zephyr Holdings",
        ownerId: alice.id,
        visibilityLevel: "all",
      });

      expect(await searchOrgs(db, alice.id, "Zephyr")).toContain("Zephyr Holdings");
    });
  });
});
