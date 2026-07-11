import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { type EntityCreateSession, resolveOwnerId, resolveVisibilityGroup } from "./entityCreate";

function session(over: Partial<EntityCreateSession> = {}): EntityCreateSession {
  return {
    userId: "creator",
    isAdmin: false,
    isActive: true,
    sessionLive: true,
    visibilityGroupIds: [],
    primaryVisibilityGroupId: null,
    flags: {},
    ...over,
  };
}

const sig = () => new AbortController().signal;

describe("resolveVisibilityGroup", () => {
  it("honors a client group hint when the actor is a member", () => {
    const r = resolveVisibilityGroup(session({ visibilityGroupIds: ["g1"] }), "g1");
    expect(r.ok && r.value).toBe("g1");
  });

  it("ignores a non-member hint and falls back to the primary group", () => {
    const r = resolveVisibilityGroup(
      session({ visibilityGroupIds: ["g1"], primaryVisibilityGroupId: "gp" }),
      "g-not-mine",
    );
    expect(r.ok && r.value).toBe("gp");
  });

  it("errors when neither a member hint nor a primary group is available", () => {
    const r = resolveVisibilityGroup(session(), undefined);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.id).toBe("E_PERM_003");
  });
});

describe("resolveOwnerId", () => {
  it("returns the creator when no override is requested", async () => {
    await withTestDb(async (db) => {
      const u = await seedUser(db);
      const r = await resolveOwnerId(db, session({ userId: u.id }), undefined, sig());
      expect(r.ok && r.value).toBe(u.id);
    });
  });

  it("ignores an override without deal.changeOwner", async () => {
    await withTestDb(async (db) => {
      const creator = await seedUser(db);
      const target = await seedUser(db);
      const r = await resolveOwnerId(db, session({ userId: creator.id }), target.id, sig());
      expect(r.ok && r.value).toBe(creator.id);
    });
  });

  it("honors an override with deal.changeOwner when the target exists", async () => {
    await withTestDb(async (db) => {
      const creator = await seedUser(db);
      const target = await seedUser(db);
      const r = await resolveOwnerId(
        db,
        session({ userId: creator.id, flags: { "deal.changeOwner": true } }),
        target.id,
        sig(),
      );
      expect(r.ok && r.value).toBe(target.id);
    });
  });

  it("rejects an override to a non-existent user", async () => {
    await withTestDb(async (db) => {
      const creator = await seedUser(db);
      const r = await resolveOwnerId(
        db,
        session({ userId: creator.id, isAdmin: true }),
        "00000000-0000-0000-0000-000000000000",
        sig(),
      );
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.id).toBe("E_USER_001");
    });
  });
});
