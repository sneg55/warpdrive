import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { canSee } from "./canSee";
import { dealVisibilityPredicate, type VisibilityCtx } from "./sql";
import {
  F_GROUP,
  F_NULL_OWNER,
  F_VISIBLE_TO,
  FIXTURES,
  type Fixture,
  GROUP,
  OWNER,
  PGROUP,
  STRANGER,
  VIEWER,
} from "./sqlParityFixtures";
import type { AuthUser, VisibleDeal } from "./types";

let h: TestDb;

// A viewer scenario maps to both an AuthUser (for canSee) and a VisibilityCtx (for SQL),
// so a single source of truth drives both sides of the parity check.
interface Scenario {
  name: string;
  userId: string;
  isAdmin: boolean;
  isActive: boolean;
  sessionLive: boolean;
  groupIds: string[];
  // Team members this viewer manages (already gated on team.viewMembers at hydration).
  managedUserIds?: string[];
}

function toAuthUser(s: Scenario): AuthUser {
  return {
    id: s.userId,
    type: s.isAdmin ? "admin" : "regular",
    isActive: s.isActive,
    groupIds: new Set(s.groupIds),
    managedUserIds: new Set(s.managedUserIds ?? []),
  };
}

function toCtx(s: Scenario): VisibilityCtx {
  return {
    userId: s.userId,
    isAdmin: s.isAdmin,
    isActive: s.isActive,
    sessionLive: s.sessionLive,
    groupIds: s.groupIds,
    managedUserIds: s.managedUserIds ?? [],
  };
}

function toVisibleDeal(f: Fixture): VisibleDeal {
  return {
    kind: "deal",
    ownerId: f.ownerId,
    visibilityLevel: f.visibilityLevel,
    visibilityGroupId: f.visibilityGroupId,
    visibleToUserIds: f.visibleToUserIds,
    pipelineVisibilityGroupId: f.pipelineVisibilityGroupId,
  };
}

// Expected id set: run the REAL canSee over the SAME fixtures. canSee has no sessionLive
// concept, so a dead session is asserted directly to be empty rather than via canSee.
function canSeeVisibleIds(s: Scenario): string[] {
  if (!s.sessionLive) return [];
  const user = toAuthUser(s);
  return FIXTURES.filter((f) => canSee(user, toVisibleDeal(f)))
    .map((f) => f.id)
    .sort();
}

async function sqlVisibleIds(s: Scenario): Promise<string[]> {
  const pred = dealVisibilityPredicate(toCtx(s), {
    ownerId: sql`owner_id`,
    visibilityLevel: sql`visibility_level`,
    visibilityGroupId: sql`visibility_group_id`,
    visibleToUserIds: sql`visible_to_user_ids`,
    pipelineVisibilityGroupId: sql`pipeline_visibility_group_id`,
  });
  const r = await h.db.execute(sql`SELECT id::text AS id FROM t_deals WHERE ${pred} ORDER BY id`);
  return (r.rows as { id: string }[]).map((row) => row.id);
}

beforeAll(async () => {
  h = await makeTestDb();
  await h.db.execute(sql`
    CREATE TABLE t_deals (
      id uuid primary key,
      owner_id uuid,
      visibility_level text not null,
      visibility_group_id uuid,
      visible_to_user_ids uuid[] not null default '{}',
      pipeline_visibility_group_id uuid
    )`);
  for (const f of FIXTURES) {
    const visibleTo =
      f.visibleToUserIds.length === 0
        ? sql`'{}'::uuid[]`
        : sql`ARRAY[${sql.join(
            f.visibleToUserIds.map((u) => sql`${u}::uuid`),
            sql`, `,
          )}]`;
    await h.db.execute(sql`
      INSERT INTO t_deals (id, owner_id, visibility_level, visibility_group_id, visible_to_user_ids, pipeline_visibility_group_id)
      VALUES (${f.id}, ${f.ownerId}, ${f.visibilityLevel}, ${f.visibilityGroupId}, ${visibleTo}, ${f.pipelineVisibilityGroupId})`);
  }
});
afterAll(async () => {
  await h.close();
});

const SCENARIOS: Scenario[] = [
  {
    name: "regular viewer in GROUP (not PGROUP)",
    userId: VIEWER,
    isAdmin: false,
    isActive: true,
    sessionLive: true,
    groupIds: [GROUP],
  },
  {
    name: "regular viewer in GROUP and PGROUP",
    userId: VIEWER,
    isAdmin: false,
    isActive: true,
    sessionLive: true,
    groupIds: [GROUP, PGROUP],
  },
  {
    name: "regular viewer with empty groupIds",
    userId: VIEWER,
    isAdmin: false,
    isActive: true,
    sessionLive: true,
    groupIds: [],
  },
  {
    name: "STRANGER (non-owner, non-member) for additive-allow",
    userId: STRANGER,
    isAdmin: false,
    isActive: true,
    sessionLive: true,
    groupIds: [],
  },
  {
    name: "admin (bypass)",
    userId: VIEWER,
    isAdmin: true,
    isActive: true,
    sessionLive: true,
    groupIds: [],
  },
  {
    name: "inactive admin (rule 0 beats bypass)",
    userId: VIEWER,
    isAdmin: true,
    isActive: false,
    sessionLive: true,
    groupIds: [],
  },
  {
    // Team manager: VIEWER manages OWNER, so owner-level rows owned by OWNER become visible, but a
    // group-restricted pipeline still hard-gates them. Parity with canSee is the assertion.
    name: "team manager of OWNER (managedUserIds)",
    userId: VIEWER,
    isAdmin: false,
    isActive: true,
    sessionLive: true,
    groupIds: [],
    managedUserIds: [OWNER],
  },
];

describe("dealVisibilityPredicate id-set parity with canSee", () => {
  for (const s of SCENARIOS) {
    test(`${s.name}: SQL id set equals canSee id set`, async () => {
      const expected = canSeeVisibleIds(s);
      const actual = await sqlVisibleIds(s);
      expect(actual).toEqual(expected);
    });
  }

  // Spot-checks pin the discriminating edge cases to explicit expectations, so a future
  // regression that silently moves BOTH sides together is still caught.
  test("group-level row hidden from non-admin with empty groupIds", () => {
    const user = toAuthUser({
      name: "",
      userId: VIEWER,
      isAdmin: false,
      isActive: true,
      sessionLive: true,
      groupIds: [],
    });
    const group = FIXTURES.find((f) => f.id === F_GROUP);
    expect(group).toBeDefined();
    if (group) expect(canSee(user, toVisibleDeal(group))).toBe(false);
  });

  test("owner-level row with NULL owner hidden from every non-admin", () => {
    const user = toAuthUser({
      name: "",
      userId: VIEWER,
      isAdmin: false,
      isActive: true,
      sessionLive: true,
      groupIds: [GROUP, PGROUP],
    });
    const unowned = FIXTURES.find((f) => f.id === F_NULL_OWNER);
    expect(unowned).toBeDefined();
    if (unowned) expect(canSee(user, toVisibleDeal(unowned))).toBe(false);
  });

  test("visible_to grants a non-owner non-member viewer via additive allow", async () => {
    const ids = await sqlVisibleIds({
      name: "",
      userId: STRANGER,
      isAdmin: false,
      isActive: true,
      sessionLive: true,
      groupIds: [],
    });
    expect(ids).toContain(F_VISIBLE_TO);
  });

  test("dead session yields empty id set", async () => {
    const ids = await sqlVisibleIds({
      name: "",
      userId: VIEWER,
      isAdmin: true,
      isActive: true,
      sessionLive: false,
      groupIds: [],
    });
    expect(ids).toEqual([]);
  });
});
