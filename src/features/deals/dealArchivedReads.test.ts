import { afterAll, beforeAll, expect, it } from "vitest";
import { deals } from "@/db/schema";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { makeTestDb } from "@/test/db";
import { archiveDeal } from "./archiveDeal";
import { getBoardColumns, listDeals } from "./dealRepo";
import { actorToSession } from "./dealRouter";

let h: Awaited<ReturnType<typeof makeTestDb>>;
const sig = () => new AbortController().signal;
beforeAll(async () => {
  h = await makeTestDb();
}, 60_000);
afterAll(async () => {
  await h.close();
});

function actor(id: string): PermSetUser {
  return { id, type: "admin", isActive: true, groupIds: new Set(), flags: new Set() };
}

it("archived deal leaves the board and default list, appears in archived list", async () => {
  const u = await seedUser(h.db);
  const { pipeline, stages } = await seedPipelineWithStages(h.db, ["Qualified"]);
  const [d] = await h.db
    .insert(deals)
    .values({
      title: "Acme",
      pipelineId: pipeline.id,
      stageId: stages[0]!.id,
      ownerId: u.id,
      visibilityLevel: "all",
    })
    .returning();
  if (d === undefined) throw new Error("deal insert returned undefined");
  const session = actorToSession(actor(u.id));

  await archiveDeal(h.db, actor(u.id), { dealId: d.id, archived: true }, sig());

  const board = await getBoardColumns(h.db, session, pipeline.id, sig());
  expect(board.cards.some((c) => c.id === d.id)).toBe(false);

  const active = await listDeals(
    h.db,
    session,
    { pipelineId: pipeline.id, offset: 0, limit: 50 },
    sig(),
  );
  expect(active.rows.some((r) => r.id === d.id)).toBe(false);

  const archived = await listDeals(
    h.db,
    session,
    { pipelineId: pipeline.id, offset: 0, limit: 50, archived: true },
    sig(),
  );
  expect(archived.rows.some((r) => r.id === d.id)).toBe(true);
});

it("an archived won deal still appears in the archived list (status filter dropped)", async () => {
  const u = await seedUser(h.db);
  const { pipeline, stages } = await seedPipelineWithStages(h.db, ["Qualified"]);
  const [d] = await h.db
    .insert(deals)
    .values({
      title: "WonDeal",
      status: "won",
      pipelineId: pipeline.id,
      stageId: stages[0]!.id,
      ownerId: u.id,
      visibilityLevel: "all",
    })
    .returning();
  if (d === undefined) throw new Error("deal insert returned undefined");
  const session = actorToSession(actor(u.id));

  await archiveDeal(h.db, actor(u.id), { dealId: d.id, archived: true }, sig());

  const archived = await listDeals(
    h.db,
    session,
    { pipelineId: pipeline.id, offset: 0, limit: 50, archived: true },
    sig(),
  );
  expect(archived.rows.some((r) => r.id === d.id)).toBe(true);
});
