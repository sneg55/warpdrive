import { Pool } from "pg";
import { DATABASE_URL } from "./seed-smoke-config";
import {
  addToGroup,
  makeDb,
  seedPermissionSets,
  seedSettings,
  seedVisibilityGroups,
  upsertUser,
} from "./seed-smoke-phase5-infra";
import {
  ensureActivityType,
  upsertActivity,
  upsertDeal,
  upsertOrg,
  upsertPerson,
  upsertPipeline,
  upsertRestrictedDeal,
  upsertStage,
} from "./seed-smoke-phase5-records";

const pool = new Pool({ connectionString: DATABASE_URL });

async function main(): Promise<void> {
  const db = makeDb(pool);

  await seedSettings(db);
  const { regularSetId, adminSetId } = await seedPermissionSets(db);
  const { everyoneGroupId, restrictedGroupId } = await seedVisibilityGroups(db);

  const userAId = await upsertUser(
    db,
    "a@example.com",
    "User A",
    true,
    adminSetId,
    everyoneGroupId,
  );
  const userBId = await upsertUser(
    db,
    "b@example.com",
    "User B",
    false,
    regularSetId,
    everyoneGroupId,
  );
  const userCId = await upsertUser(
    db,
    "c@example.com",
    "User C",
    false,
    regularSetId,
    everyoneGroupId,
  );

  await addToGroup(db, userAId, everyoneGroupId);
  await addToGroup(db, userBId, everyoneGroupId);
  await addToGroup(db, userCId, everyoneGroupId);
  await addToGroup(db, userAId, restrictedGroupId);

  await db.q(
    `UPDATE settings SET bootstrapped_at = now() WHERE id = true AND bootstrapped_at IS NULL`,
  );

  const actTypeId = await ensureActivityType(db);

  const mainPipelineId = await upsertPipeline(db, "Acme BD", null);
  const stageLeadId = await upsertStage(db, mainPipelineId, "Lead", 0, 20);
  const stageQualifiedId = await upsertStage(db, mainPipelineId, "Qualified", 1, 50);
  const stageWonId = await upsertStage(db, mainPipelineId, "Won", 2, 100);
  const stageLostId = await upsertStage(db, mainPipelineId, "Lost", 3, 0);

  const restrictedPipelineId = await upsertPipeline(db, "Restricted Pipeline", restrictedGroupId);
  const restrictedStageId = await upsertStage(db, restrictedPipelineId, "Stage 1", 0, 50);

  const orgId = await upsertOrg(db, "Acme Corp", userAId);
  const personId = await upsertPerson(db, "Acme Jane", "acme.jane@example.com", userAId, orgId);

  const dealLeadId = await upsertDeal(
    db,
    "Acme Open Lead Deal",
    mainPipelineId,
    stageLeadId,
    userAId,
    "open",
    "15000.00",
    personId,
    orgId,
  );
  await upsertDeal(
    db,
    "Acme Qualified Deal",
    mainPipelineId,
    stageQualifiedId,
    userAId,
    "open",
    "25000.00",
    personId,
    orgId,
  );
  await upsertDeal(
    db,
    "Acme Won Deal",
    mainPipelineId,
    stageWonId,
    userAId,
    "won",
    "40000.00",
    personId,
    orgId,
  );
  await upsertDeal(
    db,
    "Acme Lost Deal",
    mainPipelineId,
    stageLostId,
    userAId,
    "lost",
    "10000.00",
    personId,
    orgId,
  );

  await upsertRestrictedDeal(
    db,
    "Acme Restricted Deal",
    restrictedPipelineId,
    restrictedStageId,
    userAId,
    restrictedGroupId,
  );

  await upsertActivity(db, actTypeId, "Completed call 1", userAId, userAId, true, null, dealLeadId);
  await upsertActivity(db, actTypeId, "Completed call 2", userAId, userAId, true, null, dealLeadId);
  await upsertActivity(db, actTypeId, "Completed call 3", userAId, userAId, true, null, dealLeadId);
  await upsertActivity(
    db,
    actTypeId,
    "Scheduled call 1",
    userAId,
    userAId,
    false,
    new Date(Date.now() + 86_400_000),
    dealLeadId,
  );
  await upsertActivity(
    db,
    actTypeId,
    "Scheduled call 2",
    userAId,
    userAId,
    false,
    new Date(Date.now() + 7 * 86_400_000),
    dealLeadId,
  );
  await upsertActivity(
    db,
    actTypeId,
    "Scheduled call 3",
    userAId,
    userAId,
    false,
    new Date(Date.now() + 14 * 86_400_000),
    dealLeadId,
  );

  console.warn("phase5_user_a=a@example.com (admin, stats.viewOthers)");
  console.warn("phase5_user_b=b@example.com (regular, Everyone)");
  console.warn("phase5_user_c=c@example.com (regular, no RestrictedGroup)");
  console.warn(`phase5_everyone_group=${everyoneGroupId}`);
  console.warn(`phase5_restricted_group=${restrictedGroupId}`);
  console.warn(`phase5_main_pipeline=${mainPipelineId} (Acme BD)`);
  console.warn(`phase5_restricted_pipeline=${restrictedPipelineId} (Restricted Pipeline)`);
  console.warn(`phase5_deal_lead=${dealLeadId} (mention/presence target)`);
}

main()
  .catch((e: unknown) => {
    console.error("seed-smoke-phase5 failed:", e);
    process.exit(1);
  })
  .finally(() => {
    void pool.end();
  });
