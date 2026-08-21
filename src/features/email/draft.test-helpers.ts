import { sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { withTestDb } from "@/db/testing";
import { seedPipelineWithStages } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";

// Seeds shared by the draft-link tests (draftLinks + draftEntityReads), which both need a mailbox
// and a deal/person to link a draft to.
export type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

export const actorOf = (id: string): AuthUser => ({
  id,
  type: "regular",
  isActive: true,
  groupIds: new Set(),
});

export async function seedAccount(db: TestDb, ownerId: string, email: string): Promise<string> {
  const acct = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${ownerId}, ${email}) RETURNING id`,
    )
  ).rows[0] as { id: string };
  return acct.id;
}

export async function seedDealAndPerson(
  db: TestDb,
  ownerId: string,
): Promise<{ dealId: string; personId: string }> {
  const { pipeline, stages } = await seedPipelineWithStages(db, ["Qualified"]);
  const stage = stages[0];
  if (stage === undefined)
    throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "seedDealAndPerson: no stage returned");
  const deal = (
    await db.execute(sql`
      INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level)
      VALUES ('Test Deal', ${pipeline.id}, ${stage.id}, ${ownerId}, 'all')
      RETURNING id
    `)
  ).rows[0] as { id: string } | undefined;
  const person = (
    await db.execute(sql`
      INSERT INTO persons (name, owner_id, visibility_level)
      VALUES ('POC', ${ownerId}, 'all')
      RETURNING id
    `)
  ).rows[0] as { id: string } | undefined;
  if (deal === undefined || person === undefined)
    throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "seedDealAndPerson: no rows");
  return { dealId: deal.id, personId: person.id };
}
