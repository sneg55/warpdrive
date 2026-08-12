import { sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { notifications, permissionSets, teamMembers, teams } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { SystemMessage } from "@/features/email/sendSystem";
import { setPreference } from "@/features/notifications/preferences";
import type { EmailAccountRow } from "@/types/email";
import { ok } from "@/types/result";
import { runEmailNotificationJob } from "./job";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

async function connectMailbox(db: TestDb, userId: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO email_accounts (user_id, email_address, status)
    VALUES (${userId}, ${`mgr-${Math.random()}@example.com`}, 'connected')
  `);
}

async function seedOwnerDeal(db: TestDb, ownerId: string): Promise<string> {
  const { pipeline, stages } = await seedPipelineWithStages(db, ["Open"]);
  const stage = stages[0];
  if (stage === undefined) throw new Error("seedOwnerDeal: no stage");
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

// The send-time recheck must use the same visibility the feed and the producer use. Hydrating the
// recipient without managedUserIds makes the recheck stricter than the read path, so a team
// manager who sees the record through team.viewMembers gets the in-app notification but never the
// email, with no error anywhere: the job just reports sent: false.
it("emails a team manager who sees the deal only through team.viewMembers", async () => {
  await withTestDb(async (db) => {
    const [set] = await db
      .insert(permissionSets)
      .values({ name: `mgr-set-${Math.random()}`, flags: { "team.viewMembers": true } })
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

    await connectMailbox(db, manager.id);
    // Email delivery defaults to off per type, so opt in explicitly: this test is about the
    // visibility recheck, not the preference gate.
    await setPreference(
      db,
      manager.id,
      "activity_reminder",
      { inApp: true, email: true },
      new AbortController().signal,
    );
    const dealId = await seedOwnerDeal(db, member.id);

    const [n] = await db
      .insert(notifications)
      .values({
        userId: manager.id,
        type: "activity_reminder",
        entityType: "deal",
        entityId: dealId,
        actorId: null,
        payload: { subject: "Meeting" },
      })
      .returning();
    if (n === undefined) throw new Error("notification insert failed");

    const calls: { acct: EmailAccountRow; msg: SystemMessage }[] = [];
    const fakeSend = (acct: EmailAccountRow, msg: SystemMessage) => {
      calls.push({ acct, msg });
      return Promise.resolve(ok({ gmailMessageId: "x" }));
    };

    const r = await runEmailNotificationJob(
      db,
      { notificationId: n.id },
      new AbortController().signal,
      { send: fakeSend },
    );

    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    expect(r.value.sent, "manager's notification email was dropped").toBe(true);
    expect(calls).toHaveLength(1);
  });
});
