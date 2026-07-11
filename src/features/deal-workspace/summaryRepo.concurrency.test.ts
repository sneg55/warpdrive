// getWorkspace must issue its post-gate reads concurrently, not one after another.
// Real Postgres via Testcontainers (no DB mocking, see CLAUDE.md): we wrap the real pool's
// query method to observe how many statements are in flight at once, then hand the untouched
// db handle to getWorkspace.
import { afterAll, beforeAll, expect, it } from "vitest";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import { deals } from "@/db/schema";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { getWorkspace } from "./summaryRepo";

let h: Awaited<ReturnType<typeof makeTestDb>>;

beforeAll(async () => {
  h = await makeTestDb();
}, 60_000);

afterAll(async () => {
  await h.close();
});

function makeActor(userId: string) {
  return {
    id: userId,
    type: "regular" as const,
    isActive: true,
    groupIds: new Set<string>(),
    flags: new Set<PermissionFlagKey>(),
    primaryVisibilityGroupId: null,
  };
}

const sig = () => new AbortController().signal;

// Swap pool.query for a counting wrapper. Returns the peak number of statements that were
// in flight simultaneously, plus a restore(). The wrapper delegates to the real query, so the
// database work is unchanged.
function trackPeakConcurrency(pool: typeof h.pool): {
  peak: () => number;
  restore: () => void;
} {
  const original = pool.query.bind(pool);
  let inFlight = 0;
  let peak = 0;
  const counting = (...args: unknown[]): unknown => {
    inFlight += 1;
    if (inFlight > peak) peak = inFlight;
    const settled = (original as (...a: unknown[]) => Promise<unknown>)(...args);
    return settled.finally(() => {
      inFlight -= 1;
    });
  };
  Object.assign(pool, { query: counting });
  return {
    peak: () => peak,
    restore: () => {
      Object.assign(pool, { query: original });
    },
  };
}

// The reads after the visibility gate (stages, followers, owner, lost-reason options, custom
// field defs) depend only on the already-loaded deal, so all five can be in flight together.
// Serialized, the peak is 1.
const UNCONDITIONAL_POST_GATE_READS = 5;

it("issues the post-gate reads concurrently rather than serially", async () => {
  const user = await seedUser(h.db);
  const actor = makeActor(user.id);
  const pipe = await seedPipelineWithStages(h.db, ["Lead", "Qualified", "Won"]);

  const [deal] = await h.db
    .insert(deals)
    .values({
      title: "D",
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId: user.id,
      visibilityLevel: "all",
    })
    .returning();
  if (deal === undefined) throw new Error("setup: deal insert failed");

  const tracker = trackPeakConcurrency(h.pool);
  const r = await getWorkspace(h.db, actor, deal.id, sig());
  tracker.restore();

  expect(r.ok).toBe(true);
  expect(tracker.peak()).toBeGreaterThanOrEqual(UNCONDITIONAL_POST_GATE_READS);
});
