// Integration tests for the change-log row markLost writes. Real Postgres via Testcontainers.
// No database mocking: mock/prod divergence hides broken queries (see CLAUDE.md).
import { afterAll, beforeAll, expect, it } from "vitest";
import { CHANGE_FIELD_STATUS } from "@/constants/changeLogFields";
import { deals, lostReasons } from "@/db/schema";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { listChangeLog } from "@/features/collaboration/changeLog";
import type { PermSetUser } from "@/features/permissions/effective";
import { makeTestDb } from "@/test/db";
import { formatChangeLabel } from "./changeLabel";
import { markLost, markWon } from "./wonLost";

let h: Awaited<ReturnType<typeof makeTestDb>>;

beforeAll(async () => {
  h = await makeTestDb();
}, 60_000);

afterAll(async () => {
  await h.close();
});

function makeActor(userId: string): PermSetUser {
  return { id: userId, type: "admin", isActive: true, groupIds: new Set(), flags: new Set() };
}

async function seedDeal(title: string): Promise<{ dealId: string; actor: PermSetUser }> {
  const user = await seedUser(h.db);
  const pipe = await seedPipelineWithStages(h.db, ["Qualified"]);
  const [deal] = await h.db
    .insert(deals)
    .values({
      title,
      pipelineId: pipe.pipeline.id,
      stageId: pipe.stages[0]!.id,
      ownerId: user.id,
      visibilityLevel: "all",
    })
    .returning();
  if (deal === undefined) throw new Error("deal insert returned undefined");
  return { dealId: deal.id, actor: makeActor(user.id) };
}

async function statusEntry(dealId: string): Promise<{ oldValue: unknown; newValue: unknown }> {
  const log = await listChangeLog(h.db, "deal", dealId, new AbortController().signal);
  const entry = log.find((e) => e.field === CHANGE_FIELD_STATUS);
  if (entry === undefined) throw new Error("no status change-log entry");
  return { oldValue: entry.oldValue, newValue: entry.newValue };
}

it("markLost logs the resolved reason name and the free-text comment", async () => {
  const { dealId, actor } = await seedDeal("Lost with reason and comment");
  const [reason] = await h.db.select().from(lostReasons).limit(1);
  if (reason === undefined) throw new Error("no seeded lost_reasons found");

  const r = await markLost(
    h.db,
    actor,
    dealId,
    { lostReasonId: reason.id, lostReason: "my bad, this was old" },
    new AbortController().signal,
  );
  expect(r.ok).toBe(true);

  const entry = await statusEntry(dealId);
  expect(entry.newValue).toEqual({
    value: "lost",
    reason: reason.name,
    comment: "my bad, this was old",
  });
  expect(formatChangeLabel({ field: CHANGE_FIELD_STATUS, ...entry })).toBe(
    `Status: open → lost · ${reason.name} · my bad, this was old`,
  );
});

it("markLost logs a free-text-only reason", async () => {
  const { dealId, actor } = await seedDeal("Lost with free text only");

  const r = await markLost(
    h.db,
    actor,
    dealId,
    { lostReasonId: null, lostReason: "Budget cut" },
    new AbortController().signal,
  );
  expect(r.ok).toBe(true);

  const entry = await statusEntry(dealId);
  expect(entry.newValue).toEqual({ value: "lost", reason: null, comment: "Budget cut" });
});

it("markLost with no reason logs the plain status string", async () => {
  const { dealId, actor } = await seedDeal("Lost with no reason");

  const r = await markLost(
    h.db,
    actor,
    dealId,
    { lostReasonId: null, lostReason: null },
    new AbortController().signal,
  );
  expect(r.ok).toBe(true);

  const entry = await statusEntry(dealId);
  expect(entry.newValue).toBe("lost");
  expect(formatChangeLabel({ field: CHANGE_FIELD_STATUS, ...entry })).toBe("Status: open → lost");
});

it("markWon logs the plain status string", async () => {
  const { dealId, actor } = await seedDeal("Won");

  const r = await markWon(h.db, actor, dealId, new AbortController().signal);
  expect(r.ok).toBe(true);

  const entry = await statusEntry(dealId);
  expect(entry.newValue).toBe("won");
});
