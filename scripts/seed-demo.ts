/**
 * scripts/seed-demo.ts
 *
 * Rich demo dataset for local exploration and screenshots. Standalone from the
 * smoke seeds: creates demo users and, scoped to them, a full CRM dataset across
 * deals/leads/contacts/activities/emails plus labels, notes, notifications,
 * files, tracking, participants, teams, custom fields, and visibility variety.
 *
 * Run: pnpm db:seed:demo
 * Re-runnable: wipes previously seeded demo-owned rows, then reseeds
 * deterministically (fixed PRNG seed). Smoke/phase5 fixtures are left alone.
 * Login any demo user via /auth/dev-login?email=demo1@example.com (dev only).
 */

import { Pool } from "pg";
import {
  ensureActivityTypes,
  ensureDemoPipeline,
  insertActivities,
  seedStandaloneActivities,
} from "./seed-demo-activities";
import {
  seedCustomFieldDefs,
  seedEmailTemplates,
  seedLabels,
  seedLostReasons,
  seedSignatures,
  seedTeams,
} from "./seed-demo-catalog";
import {
  seedActivityExtras,
  seedFiles,
  seedNotes,
  seedNotifications,
  seedSavedFilters,
} from "./seed-demo-collab";
import { at, buildDeals, buildLeads, buildOrgs, buildPeople, makeRng } from "./seed-demo-data";
import { seedUserEmails } from "./seed-demo-email";
import { seedAccountStates, seedEmailTracking } from "./seed-demo-email-extra";
import {
  applyLabels,
  applyLostReasons,
  convertLeads,
  seedParticipantsFollowers,
} from "./seed-demo-enrich";
import { seedContactFollowers, seedInvitedUser, seedOrgRelations } from "./seed-demo-graph";
import { insertDeals, insertLeads, insertOrgs, insertPeople, wipeDemo } from "./seed-demo-records";
import { type DemoUser, setupDemoUsers, softDeleteSamples } from "./seed-demo-users";
import { DATABASE_URL } from "./seed-smoke-config";
import {
  makeDb,
  seedPermissionSets,
  seedSettings,
  seedVisibilityGroups,
} from "./seed-smoke-phase5-infra";

const pool = new Pool({ connectionString: DATABASE_URL });

const ORGS = 50;
const PEOPLE = 100;
const DEALS = 50;
const LEADS = 50;
const EMAILS_PER_USER = 25;
const STANDALONE_ACTIVITIES = 20;
const SEED = 0x5eed;

const DEMO_USERS: DemoUser[] = [
  { email: "demo1@example.com", name: "Demo Admin", admin: true },
  { email: "demo2@example.com", name: "Demo Rep Bianca", admin: false },
  { email: "demo3@example.com", name: "Demo Rep Chen", admin: false },
  { email: "demo4@example.com", name: "Demo Rep Diego", admin: false },
  { email: "demo5@example.com", name: "Demo Rep Esra", admin: false },
];

async function main(): Promise<void> {
  const db = makeDb(pool);
  const rng = makeRng(SEED);

  await seedSettings(db);
  const { regularSetId, adminSetId } = await seedPermissionSets(db);
  const { everyoneGroupId } = await seedVisibilityGroups(db);
  const { userIds, westGroupId } = await setupDemoUsers(
    db,
    DEMO_USERS,
    regularSetId,
    adminSetId,
    everyoneGroupId,
  );
  // Close bootstrap so a later dev-login doesn't re-elect a regular user to admin.
  await db.q(
    `UPDATE settings SET bootstrapped_at = now() WHERE id = true AND bootstrapped_at IS NULL`,
  );
  // A pending invite (no SSO yet) so the users settings list shows the Invited state.
  await seedInvitedUser(db, regularSetId, everyoneGroupId);

  await wipeDemo(db, userIds);

  const { pipelineId, stageIds } = await ensureDemoPipeline(db);
  const typeIds = await ensureActivityTypes(db);
  await seedCustomFieldDefs(db);
  const labels = await seedLabels(db);
  const reasonIds = await seedLostReasons(db);

  // Core records.
  const orgSeeds = buildOrgs(rng, ORGS, userIds);
  const orgIds = await insertOrgs(db, orgSeeds, westGroupId);
  const peopleSeeds = buildPeople(rng, PEOPLE, orgSeeds, userIds);
  const personIds = await insertPeople(db, peopleSeeds, orgIds, westGroupId);
  const dealSeeds = buildDeals(rng, DEALS, stageIds.length, userIds, ORGS, PEOPLE);
  const dealIds = await insertDeals(
    db,
    dealSeeds,
    pipelineId,
    stageIds,
    orgIds,
    personIds,
    westGroupId,
  );

  // Activities (per-deal + standalone + participants/guests).
  const dealRefs = dealSeeds.map((d, i) => ({
    id: at(dealIds, i),
    ownerId: d.ownerId,
    personId: at(personIds, d.personIdx),
    orgId: at(orgIds, d.orgIdx),
  }));
  const activityCount = await insertActivities(db, dealRefs, typeIds, userIds, rng);
  await seedStandaloneActivities(
    db,
    rng,
    STANDALONE_ACTIVITIES,
    userIds,
    personIds,
    orgIds,
    typeIds,
  );
  await seedActivityExtras(db, rng, userIds, personIds);

  // Deal enrichment.
  await applyLabels(db, rng, dealIds, personIds, orgIds, labels);
  await applyLostReasons(db, rng, dealIds, dealSeeds, reasonIds);
  await seedParticipantsFollowers(
    db,
    rng,
    dealIds,
    dealSeeds.map((d) => d.ownerId),
    personIds,
    userIds,
  );

  // Contact graph: inter-org relations + contact followers (Wave 3). Relations link
  // only broadly-visible ("all") orgs so the related-orgs panel renders for every
  // viewer (a relation to an owner-private org is hidden by the panel's canSee gate).
  const publicOrgIds = orgIds.filter((_, i) => at(orgSeeds, i).visibility === "all");
  const relationCount = await seedOrgRelations(db, rng, publicOrgIds);
  const followerCount = await seedContactFollowers(db, rng, personIds, orgIds, userIds);

  // Leads (+ some converted to deals).
  const leadSeeds = buildLeads(rng, LEADS, userIds, PEOPLE, ORGS);
  const leadIds = await insertLeads(db, leadSeeds, personIds, orgIds);
  const convertedCount = await convertLeads(
    db,
    rng,
    leadIds,
    leadSeeds,
    personIds,
    orgIds,
    pipelineId,
    at(stageIds, 0),
  );

  // Collaboration + peripheral state.
  const noteCount = await seedNotes(
    db,
    rng,
    { deal: dealIds, person: personIds, org: orgIds },
    userIds,
  );
  const notifCount = await seedNotifications(db, rng, userIds, dealIds);
  const fileCount = await seedFiles(db, rng, dealIds, personIds, userIds);
  await seedSavedFilters(db, userIds);
  await seedTeams(db, userIds);
  await seedEmailTemplates(db, at(userIds, 0));
  await seedSignatures(
    db,
    userIds,
    DEMO_USERS.map((u) => u.name),
  );

  // Email: per-user mailbox, then tracking + account states.
  const personEmails = peopleSeeds.map((p) => p.email);
  let emailCount = 0;
  for (let i = 0; i < DEMO_USERS.length; i += 1) {
    emailCount += await seedUserEmails(db, {
      accountUserId: at(userIds, i),
      userEmail: at(DEMO_USERS, i).email,
      rng,
      personEmails,
      personIds,
      dealIds,
      count: EMAILS_PER_USER,
    });
  }
  const trackingEvents = await seedEmailTracking(db, rng, userIds);
  await seedAccountStates(db, userIds);

  // Soft-delete a few records last so archive/trash views are populated.
  await softDeleteSamples(db, dealIds, personIds);

  console.warn(`demo_users=${DEMO_USERS.map((u) => u.email).join(",")} (+demo6 deactivated)`);
  console.warn(`demo_orgs=${orgIds.length} demo_people=${personIds.length}`);
  console.warn(
    `demo_deals=${dealIds.length} demo_activities=${activityCount} converted_leads=${convertedCount}`,
  );
  console.warn(
    `demo_leads=${leadIds.length} demo_emails=${emailCount} tracking_events=${trackingEvents}`,
  );
  console.warn(`demo_notes=${noteCount} demo_notifications=${notifCount} demo_files=${fileCount}`);
  console.warn(
    `demo_org_relations=${relationCount} demo_contact_followers=${followerCount} demo_invited=1`,
  );
  console.warn(`demo_pipeline=${pipelineId} demo_login=/auth/dev-login?email=demo1@example.com`);
}

main()
  .catch((e: unknown) => {
    console.error("seed-demo failed:", e);
    process.exit(1);
  })
  .finally(() => {
    void pool.end();
  });
