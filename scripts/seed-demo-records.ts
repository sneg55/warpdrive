/**
 * scripts/seed-demo-records.ts
 *
 * Bulk record inserts and the demo-data wipe. wipeDemo removes only rows owned
 * by the demo users (in FK-safe order), so smoke/phase5 fixtures are untouched.
 * Inserts return the generated ids so the orchestrator can wire relationships.
 */

import type { DealSeed, LeadSeed, OrgSeed, PersonSeed, Visibility } from "./seed-demo-data";
import { at } from "./seed-demo-data";
import type { Db } from "./seed-smoke-phase5-infra";

// Maps a seed Visibility to (visibility_level, visibility_group_id). Group-scoped
// rows point at the demo "West Team" group; owner/all rows carry no group.
function vis(v: Visibility, groupId: string): { level: Visibility; group: string | null } {
  return v === "group" ? { level: "group", group: groupId } : { level: v, group: null };
}

// Removes every demo-owned row in FK-safe order (children first). Label join
// tables and cf-def catalogs are shared/idempotent and intentionally kept.
export async function wipeDemo(db: Db, ownerIds: string[]): Promise<void> {
  const u = [ownerIds];
  const acct = `(SELECT id FROM email_accounts WHERE user_id = ANY($1::uuid[]))`;
  const demoDeals = `(SELECT id FROM deals WHERE owner_id = ANY($1::uuid[]))`;
  const demoActs = `(SELECT id FROM activities WHERE owner_id = ANY($1::uuid[]))`;
  const demoNotes = `(SELECT id FROM notes WHERE author_id = ANY($1::uuid[]))`;
  const demoOrgs = `(SELECT id FROM organizations WHERE owner_id = ANY($1::uuid[]))`;
  // Thread reads have no FK on thread_id, so they must be cleared explicitly by
  // the demo owner (deleting the threads alone would orphan them).
  await db.q(`DELETE FROM email_thread_reads WHERE user_id = ANY($1::uuid[])`, u);
  // Email tree. Attachments cascade on message delete; reads handled above.
  await db.q(
    `DELETE FROM email_tracking_events WHERE message_id IN
       (SELECT id FROM email_messages WHERE account_id IN ${acct})`,
    u,
  );
  await db.q(
    `DELETE FROM email_tracking_tokens WHERE send_attempt_id IN
       (SELECT id FROM email_send_attempts WHERE account_id IN ${acct})`,
    u,
  );
  await db.q(`DELETE FROM email_send_attempts WHERE account_id IN ${acct}`, u);
  // Drafts FK-reference the account (email_drafts_account_id_email_accounts_id_fk); they must
  // be cleared before the account, or a re-seed aborts once any draft exists.
  await db.q(`DELETE FROM email_drafts WHERE account_id IN ${acct}`, u);
  await db.q(`DELETE FROM email_messages WHERE account_id IN ${acct}`, u);
  await db.q(`DELETE FROM email_threads WHERE account_id IN ${acct}`, u);
  await db.q(`DELETE FROM email_accounts WHERE user_id = ANY($1::uuid[])`, u);
  // Collaboration.
  await db.q(`DELETE FROM comments WHERE note_id IN ${demoNotes}`, u);
  await db.q(`DELETE FROM mentions WHERE author_id = ANY($1::uuid[])`, u);
  await db.q(`DELETE FROM notes WHERE author_id = ANY($1::uuid[])`, u);
  await db.q(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, u);
  await db.q(`DELETE FROM files WHERE uploaded_by = ANY($1::uuid[])`, u);
  // Contact followers have no FK on entity_id; clear the demo users' follows.
  await db.q(`DELETE FROM contact_followers WHERE user_id = ANY($1::uuid[])`, u);
  // Activities + their guests/participants.
  await db.q(`DELETE FROM activity_guests WHERE activity_id IN ${demoActs}`, u);
  await db.q(`DELETE FROM activity_participants WHERE activity_id IN ${demoActs}`, u);
  await db.q(`DELETE FROM activities WHERE owner_id = ANY($1::uuid[])`, u);
  // Deal children, then core records.
  await db.q(`DELETE FROM deal_followers WHERE deal_id IN ${demoDeals}`, u);
  await db.q(`DELETE FROM deal_participants WHERE deal_id IN ${demoDeals}`, u);
  await db.q(`UPDATE leads SET converted_deal_id = NULL WHERE owner_id = ANY($1::uuid[])`, u);
  await db.q(`DELETE FROM leads WHERE owner_id = ANY($1::uuid[])`, u);
  await db.q(`DELETE FROM deals WHERE owner_id = ANY($1::uuid[])`, u);
  await db.q(`DELETE FROM persons WHERE owner_id = ANY($1::uuid[])`, u);
  await db.q(
    `DELETE FROM organization_relations
       WHERE source_org_id IN ${demoOrgs} OR target_org_id IN ${demoOrgs}`,
    u,
  );
  await db.q(`DELETE FROM organizations WHERE owner_id = ANY($1::uuid[])`, u);
  // Owner-scoped extras.
  await db.q(`DELETE FROM saved_filters WHERE owner_id = ANY($1::uuid[])`, u);
  await db.q(`DELETE FROM email_templates WHERE owner_id = ANY($1::uuid[])`, u);
  await db.q(`DELETE FROM signatures WHERE user_id = ANY($1::uuid[])`, u);
  await db.q(
    `DELETE FROM team_members WHERE team_id IN
       (SELECT id FROM teams WHERE manager_id = ANY($1::uuid[]))`,
    u,
  );
  await db.q(`DELETE FROM teams WHERE manager_id = ANY($1::uuid[])`, u);
}

export async function insertOrgs(db: Db, orgs: OrgSeed[], groupId: string): Promise<string[]> {
  const ids: string[] = [];
  for (const o of orgs) {
    const { level, group } = vis(o.visibility, groupId);
    const [row] = await db.q<{ id: string }>(
      `INSERT INTO organizations
         (name, address, owner_id, visibility_level, visibility_group_id,
          domain, industry, employee_count, annual_revenue, linkedin_url)
       VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        o.name,
        JSON.stringify({ locality: o.city }),
        o.ownerId,
        level,
        group,
        o.domain,
        o.industry,
        o.employeeCount,
        o.annualRevenue,
        o.linkedinUrl,
      ],
    );
    if (!row) throw new Error(`org insert failed: ${o.name}`);
    ids.push(row.id);
  }
  return ids;
}

export async function insertPeople(
  db: Db,
  people: PersonSeed[],
  orgIds: string[],
  groupId: string,
): Promise<string[]> {
  const ids: string[] = [];
  for (const p of people) {
    const { level, group } = vis(p.visibility, groupId);
    const [row] = await db.q<{ id: string }>(
      `INSERT INTO persons
         (name, primary_email, emails, phones, org_id, owner_id, visibility_level, visibility_group_id)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8) RETURNING id`,
      [
        p.name,
        p.email,
        JSON.stringify(p.emails),
        JSON.stringify(p.phones),
        p.orgIdx === null ? null : at(orgIds, p.orgIdx),
        p.ownerId,
        level,
        group,
      ],
    );
    if (!row) throw new Error(`person insert failed: ${p.name}`);
    ids.push(row.id);
  }
  return ids;
}

export async function insertDeals(
  db: Db,
  deals: DealSeed[],
  pipelineId: string,
  stageIds: string[],
  orgIds: string[],
  personIds: string[],
  groupId: string,
): Promise<string[]> {
  const ids: string[] = [];
  const posByStage = new Map<number, number>();
  for (const d of deals) {
    const pos = posByStage.get(d.stageIdx) ?? 0;
    posByStage.set(d.stageIdx, pos + 1);
    const { level, group } = vis(d.visibility, groupId);
    const [row] = await db.q<{ id: string }>(
      `INSERT INTO deals
         (title, status, value, expected_close_date, custom_fields,
          pipeline_id, stage_id, board_position, stage_entered_at,
          person_id, org_id, owner_id, visibility_level, visibility_group_id,
          won_time, lost_time)
       VALUES ($1, $2::deal_status, $3, $4, $5::jsonb, $6, $7, $8,
         now() - ($9::int * interval '1 day'), $10, $11, $12, $13, $14,
         CASE WHEN $2 = 'won' THEN now() ELSE NULL END,
         CASE WHEN $2 = 'lost' THEN now() ELSE NULL END)
       RETURNING id`,
      [
        d.title,
        d.status,
        d.value,
        d.expectedCloseDate,
        JSON.stringify(d.customFields),
        pipelineId,
        at(stageIds, d.stageIdx),
        pos,
        d.stageEnteredDaysAgo,
        at(personIds, d.personIdx),
        at(orgIds, d.orgIdx),
        d.ownerId,
        level,
        group,
      ],
    );
    if (!row) throw new Error(`deal insert failed: ${d.title}`);
    ids.push(row.id);
  }
  return ids;
}

export async function insertLeads(
  db: Db,
  leads: LeadSeed[],
  personIds: string[],
  orgIds: string[],
): Promise<string[]> {
  const ids: string[] = [];
  for (const l of leads) {
    const [row] = await db.q<{ id: string }>(
      `INSERT INTO leads
         (title, value, owner_id, source_origin, person_id, org_id, visibility_level, archived_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'all', CASE WHEN $7 THEN now() ELSE NULL END)
       RETURNING id`,
      [
        l.title,
        l.value,
        l.ownerId,
        l.sourceOrigin,
        l.personIdx === null ? null : at(personIds, l.personIdx),
        l.orgIdx === null ? null : at(orgIds, l.orgIdx),
        l.archived,
      ],
    );
    if (!row) throw new Error(`lead insert failed: ${l.title}`);
    ids.push(row.id);
  }
  return ids;
}
