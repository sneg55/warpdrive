import { sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { permissionSets, teamMembers, teams } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { createNotification } from "./produce";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

// A deal owned by ownerId that only its owner (or someone with a team-manager grant over the
// owner) can see.
async function seedOwnerDeal(db: TestDb, ownerId: string): Promise<string> {
  const { pipeline, stages } = await seedPipelineWithStages(db, ["Open"]);
  const stage = stages[0];
  if (stage === undefined) throw new Error("seedOwnerDeal: no stage returned");
  const row = (
    await db.execute(sql`
      INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level)
      VALUES ('Managed Deal', ${pipeline.id}, ${stage.id}, ${ownerId}, 'owner')
      RETURNING id
    `)
  ).rows[0] as { id: string } | undefined;
  if (row === undefined) throw new Error("seedOwnerDeal: insert returned no rows");
  return row.id;
}

async function seedManagerOverMember(
  db: TestDb,
  viewMembers: boolean,
): Promise<{ managerId: string; memberId: string }> {
  const [set] = await db
    .insert(permissionSets)
    .values({
      name: `mgr-set-${Math.random()}`,
      flags: { "team.viewMembers": viewMembers },
    })
    .returning();
  if (set === undefined) throw new Error("permission set insert failed");

  const manager = await seedUser(db, { permissionSetId: set.id });
  const member = await seedUser(db);
  const [team] = await db
    .insert(teams)
    .values({ name: `T-${Math.random()}`, managerId: manager.id })
    .returning();
  if (team === undefined) throw new Error("team insert failed");
  await db.insert(teamMembers).values({ teamId: team.id, userId: member.id });
  return { managerId: manager.id, memberId: member.id };
}

// The produce-time gate must not be stricter than the read-time one. canSee rule 4b grants a
// manager holding team.viewMembers sight of records owned by their team members, so a producer
// that cannot see that grant silently drops notifications the feed would have rendered.
it("delivers to a team manager who sees the record only through team.viewMembers", async () => {
  await withTestDb(async (db) => {
    const { managerId, memberId } = await seedManagerOverMember(db, true);
    const dealId = await seedOwnerDeal(db, memberId);

    const r = await createNotification(
      db,
      {
        recipientId: managerId,
        type: "activity_reminder",
        entityType: "deal",
        entityId: dealId,
        actorId: null,
        payload: { subject: "Meeting" },
      },
      new AbortController().signal,
    );

    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    expect("notificationId" in r.value, "manager's notification was suppressed").toBe(true);
  });
});

it("still suppresses for a manager without team.viewMembers (the flag is the grant)", async () => {
  await withTestDb(async (db) => {
    const { managerId, memberId } = await seedManagerOverMember(db, false);
    const dealId = await seedOwnerDeal(db, memberId);

    const r = await createNotification(
      db,
      {
        recipientId: managerId,
        type: "activity_reminder",
        entityType: "deal",
        entityId: dealId,
        actorId: null,
        payload: { subject: "Meeting" },
      },
      new AbortController().signal,
    );

    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    expect(r.value).toEqual({ suppressed: true });
  });
});
