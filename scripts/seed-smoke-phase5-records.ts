/**
 * scripts/seed-smoke-phase5-records.ts
 *
 * Record seeders: activity types, pipelines, stages, deals, orgs, persons, activities.
 * All functions are idempotent.
 */

import type { Db } from "./seed-smoke-phase5-infra";

export async function ensureActivityType(db: Db): Promise<string> {
  await db.q(
    `INSERT INTO activity_types (key, name, icon, is_system, "order")
     VALUES ('call', 'Call', 'phone', true, 0) ON CONFLICT (key) DO NOTHING`,
  );
  const [row] = await db.q<{ id: string }>(
    `SELECT id FROM activity_types WHERE key = 'call' LIMIT 1`,
  );
  if (!row) throw new Error("activity_type seeding failed");
  return row.id;
}

export async function upsertPipeline(
  db: Db,
  name: string,
  visibilityGroupId: string | null,
): Promise<string> {
  if (visibilityGroupId !== null) {
    await db.q(
      `INSERT INTO pipelines (name, "order", visibility_group_id) VALUES ($1, 1, $2) ON CONFLICT DO NOTHING`,
      [name, visibilityGroupId],
    );
  } else {
    await db.q(`INSERT INTO pipelines (name, "order") VALUES ($1, 0) ON CONFLICT DO NOTHING`, [
      name,
    ]);
  }
  const [row] = await db.q<{ id: string }>(`SELECT id FROM pipelines WHERE name = $1 LIMIT 1`, [
    name,
  ]);
  if (!row) throw new Error(`pipeline '${name}' not found after upsert`);
  return row.id;
}

export async function upsertStage(
  db: Db,
  pipelineId: string,
  name: string,
  order: number,
  probability: number,
): Promise<string> {
  const [existing] = await db.q<{ id: string }>(
    `SELECT id FROM stages WHERE pipeline_id = $1 AND name = $2 LIMIT 1`,
    [pipelineId, name],
  );
  if (existing) return existing.id;
  const [row] = await db.q<{ id: string }>(
    `INSERT INTO stages (pipeline_id, name, "order", probability) VALUES ($1, $2, $3, $4) RETURNING id`,
    [pipelineId, name, order, probability],
  );
  if (!row) throw new Error(`stage '${name}' insert failed`);
  return row.id;
}

export async function upsertDeal(
  db: Db,
  title: string,
  pipelineId: string,
  stageId: string,
  ownerId: string,
  status: "open" | "won" | "lost",
  value: string | null,
  personId?: string,
  orgId?: string,
): Promise<string> {
  const [existing] = await db.q<{ id: string }>(
    `SELECT id FROM deals WHERE title = $1 AND pipeline_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [title, pipelineId],
  );
  if (existing) return existing.id;
  const [row] = await db.q<{ id: string }>(
    `INSERT INTO deals
       (title, status, pipeline_id, stage_id, owner_id, visibility_level,
        board_position, value, won_time, lost_time, person_id, org_id)
     VALUES ($1, $2::deal_status, $3, $4, $5, 'all', 0, $6,
       CASE WHEN $2 = 'won' THEN now() ELSE NULL END,
       CASE WHEN $2 = 'lost' THEN now() ELSE NULL END,
       $7, $8)
     RETURNING id`,
    [title, status, pipelineId, stageId, ownerId, value, personId ?? null, orgId ?? null],
  );
  if (!row) throw new Error(`deal '${title}' insert failed`);
  return row.id;
}

export async function upsertRestrictedDeal(
  db: Db,
  title: string,
  pipelineId: string,
  stageId: string,
  ownerId: string,
  visibilityGroupId: string,
): Promise<string> {
  const [existing] = await db.q<{ id: string }>(
    `SELECT id FROM deals WHERE title = $1 AND pipeline_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [title, pipelineId],
  );
  if (existing) return existing.id;
  const [row] = await db.q<{ id: string }>(
    `INSERT INTO deals
       (title, status, pipeline_id, stage_id, owner_id, visibility_level,
        visibility_group_id, board_position, value)
     VALUES ($1, 'open', $2, $3, $4, 'group', $5, 0, '50000.00')
     RETURNING id`,
    [title, pipelineId, stageId, ownerId, visibilityGroupId],
  );
  if (!row) throw new Error(`restricted deal '${title}' insert failed`);
  return row.id;
}

export async function upsertOrg(db: Db, name: string, ownerId: string): Promise<string> {
  const [existing] = await db.q<{ id: string }>(
    `SELECT id FROM organizations WHERE name = $1 AND deleted_at IS NULL LIMIT 1`,
    [name],
  );
  if (existing) return existing.id;
  const [row] = await db.q<{ id: string }>(
    `INSERT INTO organizations (name, owner_id, visibility_level) VALUES ($1, $2, 'all') RETURNING id`,
    [name, ownerId],
  );
  if (!row) throw new Error(`org '${name}' insert failed`);
  return row.id;
}

export async function upsertPerson(
  db: Db,
  name: string,
  email: string,
  ownerId: string,
  orgId?: string,
): Promise<string> {
  const [existing] = await db.q<{ id: string }>(
    `SELECT id FROM persons WHERE primary_email = $1 AND deleted_at IS NULL LIMIT 1`,
    [email],
  );
  if (existing) return existing.id;
  const [row] = await db.q<{ id: string }>(
    `INSERT INTO persons (name, primary_email, owner_id, visibility_level, org_id)
     VALUES ($1, $2, $3, 'all', $4) RETURNING id`,
    [name, email, ownerId, orgId ?? null],
  );
  if (!row) throw new Error(`person '${name}' insert failed`);
  return row.id;
}

export async function upsertActivity(
  db: Db,
  typeId: string,
  subject: string,
  ownerId: string,
  assigneeId: string,
  done: boolean,
  dueAt: Date | null,
  dealId?: string,
): Promise<void> {
  const [existing] = await db.q<{ id: string }>(
    `SELECT id FROM activities WHERE subject = $1 AND owner_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [subject, ownerId],
  );
  if (existing) return;
  await db.q(
    `INSERT INTO activities
       (type_id, subject, owner_id, assignee_id, done, done_at, due_at, deal_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [typeId, subject, ownerId, assigneeId, done, done ? new Date() : null, dueAt, dealId ?? null],
  );
}
