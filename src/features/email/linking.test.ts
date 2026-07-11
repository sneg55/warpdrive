import { describe, expect, it } from "vitest";
import { deals, persons, pipelines, stages } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import { resolveLink } from "./linking";

type Db = Parameters<Parameters<typeof withTestDb>[0]>[0];

const sig = new AbortController().signal;

function ownerAuth(id: string): AuthUser {
  return { id, type: "regular", isActive: true, groupIds: new Set<string>() };
}

// Seed a person with an external (non-workspace) primary email.
async function seedPerson(
  db: Db,
  ownerId: string,
  email: string,
  visibilityLevel: "owner" | "all",
): Promise<{ id: string }> {
  const [p] = await db
    .insert(persons)
    .values({ name: "P", primaryEmail: email, ownerId, visibilityLevel })
    .returning({ id: persons.id });
  if (p === undefined) throw new Error("person seed failed");
  return p;
}

// Seed an open deal whose primary person is personId, on a fresh unrestricted pipeline.
async function seedOpenDeal(
  db: Db,
  ownerId: string,
  personId: string,
  visibilityLevel: "owner" | "all",
): Promise<{ id: string }> {
  const [pipe] = await db
    .insert(pipelines)
    .values({ name: `pipe-${Math.random()}` })
    .returning();
  if (pipe === undefined) throw new Error("pipeline seed failed");
  const [stage] = await db
    .insert(stages)
    .values({ name: "Lead", pipelineId: pipe.id, order: 0 })
    .returning();
  if (stage === undefined) throw new Error("stage seed failed");
  const [d] = await db
    .insert(deals)
    .values({
      title: "Deal",
      pipelineId: pipe.id,
      stageId: stage.id,
      personId,
      ownerId,
      visibilityLevel,
      status: "open",
    })
    .returning({ id: deals.id });
  if (d === undefined) throw new Error("deal seed failed");
  return d;
}

describe("resolveLink (ops B4)", () => {
  it("unmatched when no visible person matches the address", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const out = await resolveLink(
        db,
        {
          owner: ownerAuth(owner.id),
          participants: ["stranger@acme.com"],
          fromEmail: "stranger@acme.com",
        },
        sig,
      );
      expect(out.kind).toBe("unmatched");
    });
  });

  it("ambiguous when more than one visible person shares the address", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      await seedPerson(db, owner.id, "jane@acme.com", "all");
      await seedPerson(db, owner.id, "jane@acme.com", "all");
      const out = await resolveLink(
        db,
        {
          owner: ownerAuth(owner.id),
          participants: ["jane@acme.com"],
          fromEmail: "jane@acme.com",
        },
        sig,
      );
      expect(out.kind).toBe("ambiguous_contact");
      if (out.kind === "ambiguous_contact") expect(out.personIds.length).toBe(2);
    });
  });

  it("auto-links to the sole open deal of a single matched person", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const p = await seedPerson(db, owner.id, "jane@acme.com", "all");
      const d = await seedOpenDeal(db, owner.id, p.id, "all");
      const out = await resolveLink(
        db,
        {
          owner: ownerAuth(owner.id),
          participants: ["jane@acme.com", `${owner.email}`],
          fromEmail: "jane@acme.com",
        },
        sig,
      );
      expect(out).toEqual({ kind: "linked", personId: p.id, dealId: d.id, dealCandidates: [] });
    });
  });

  it("links person but offers candidates when multiple open deals", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const p = await seedPerson(db, owner.id, "jane@acme.com", "all");
      await seedOpenDeal(db, owner.id, p.id, "all");
      await seedOpenDeal(db, owner.id, p.id, "all");
      const out = await resolveLink(
        db,
        {
          owner: ownerAuth(owner.id),
          participants: ["jane@acme.com"],
          fromEmail: "jane@acme.com",
        },
        sig,
      );
      expect(out.kind).toBe("linked");
      if (out.kind === "linked") {
        expect(out.dealId).toBeNull();
        expect(out.dealCandidates.length).toBe(2);
      }
    });
  });

  it("links person with null deal when the person has zero open deals", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const p = await seedPerson(db, owner.id, "jane@acme.com", "all");
      const out = await resolveLink(
        db,
        {
          owner: ownerAuth(owner.id),
          participants: ["jane@acme.com"],
          fromEmail: "jane@acme.com",
        },
        sig,
      );
      expect(out).toEqual({ kind: "linked", personId: p.id, dealId: null, dealCandidates: [] });
    });
  });

  it("returns internal when all participants are workspace users", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const out = await resolveLink(
        db,
        {
          owner: ownerAuth(owner.id),
          // both addresses are @example.com (the test workspace domain).
          participants: [`${owner.email}`, "teammate@example.com"],
          fromEmail: `${owner.email}`,
        },
        sig,
      );
      expect(out.kind).toBe("internal");
    });
  });

  it("excludes a person not visible to the owner (canSee filter runs)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const other = await seedUser(db);
      // owner-level person owned by `other`: invisible to `owner`.
      await seedPerson(db, other.id, "hidden@acme.com", "owner");
      const out = await resolveLink(
        db,
        {
          owner: ownerAuth(owner.id),
          participants: ["hidden@acme.com"],
          fromEmail: "hidden@acme.com",
        },
        sig,
      );
      expect(out.kind).toBe("unmatched");
    });
  });

  it("excludes a deal not visible to the owner from the link candidates", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const other = await seedUser(db);
      // The matched person is visible (all), but its open deal is owner-level and
      // owned by another user, so it is hidden from the mailbox owner.
      const p = await seedPerson(db, owner.id, "jane@acme.com", "all");
      await seedOpenDeal(db, other.id, p.id, "owner");
      const out = await resolveLink(
        db,
        {
          owner: ownerAuth(owner.id),
          participants: ["jane@acme.com"],
          fromEmail: "jane@acme.com",
        },
        sig,
      );
      // Person links, but the hidden deal is not surfaced as a candidate.
      expect(out).toEqual({ kind: "linked", personId: p.id, dealId: null, dealCandidates: [] });
    });
  });
});
