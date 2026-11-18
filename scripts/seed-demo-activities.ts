import { at, pick, type Rng, randInt } from "./seed-demo-data";
import type { Db } from "./seed-smoke-phase5-infra";

const STAGES = ["Qualified", "Contact Made", "Demo Scheduled", "Proposal Made", "Negotiations"];
const ACTIVITY_TYPES = [
  { key: "call", name: "Call", icon: "phone" },
  { key: "meeting", name: "Meeting", icon: "users" },
  { key: "task", name: "Task", icon: "check" },
  { key: "email", name: "Email", icon: "mail" },
  { key: "deadline", name: "Deadline", icon: "flag" },
  { key: "lunch", name: "Lunch", icon: "utensils" },
];
const SUBJECTS = [
  "Discovery call",
  "Follow-up",
  "Send proposal",
  "Demo walkthrough",
  "Contract review",
  "Kickoff",
  "Pricing chat",
  "Check-in",
  "Prepare quote",
  "Renewal sync",
];
const DAY_MS = 86_400_000;

export async function ensureDemoPipeline(
  db: Db,
): Promise<{ pipelineId: string; stageIds: string[] }> {
  let [p] = await db.q<{ id: string }>(
    `SELECT id FROM pipelines WHERE name = 'Demo Sales' ORDER BY created_at ASC LIMIT 1`,
  );
  if (!p) {
    [p] = await db.q<{ id: string }>(
      `INSERT INTO pipelines (name, "order") VALUES ('Demo Sales', 0) RETURNING id`,
    );
  }
  if (!p) throw new Error("demo pipeline missing after upsert");
  await db.q(
    `DELETE FROM pipelines WHERE id <> $1 AND id NOT IN (SELECT DISTINCT pipeline_id FROM deals)`,
    [p.id],
  );
  await db.q(`UPDATE pipelines SET "order" = 100 WHERE id <> $1`, [p.id]);
  await db.q(`UPDATE pipelines SET "order" = 0 WHERE id = $1`, [p.id]);
  const stageIds: string[] = [];
  for (let i = 0; i < STAGES.length; i += 1) {
    const name = at(STAGES, i);
    const [existing] = await db.q<{ id: string }>(
      `SELECT id FROM stages WHERE pipeline_id = $1 AND name = $2 LIMIT 1`,
      [p.id, name],
    );
    if (existing) {
      stageIds.push(existing.id);
      continue;
    }
    const [row] = await db.q<{ id: string }>(
      `INSERT INTO stages (pipeline_id, name, "order") VALUES ($1, $2, $3) RETURNING id`,
      [p.id, name, i],
    );
    if (!row) throw new Error(`stage insert failed: ${name}`);
    stageIds.push(row.id);
  }
  await db.q(`UPDATE stages SET rotting_days = 14 WHERE pipeline_id = $1`, [p.id]);
  return { pipelineId: p.id, stageIds };
}

export async function ensureActivityTypes(db: Db): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < ACTIVITY_TYPES.length; i += 1) {
    const t = at(ACTIVITY_TYPES, i);
    await db.q(
      `INSERT INTO activity_types (key, name, icon, is_system, "order")
       VALUES ($1, $2, $3, true, $4) ON CONFLICT (key) DO NOTHING`,
      [t.key, t.name, t.icon, i],
    );
    const [row] = await db.q<{ id: string }>(
      `SELECT id FROM activity_types WHERE key = $1 LIMIT 1`,
      [t.key],
    );
    if (!row) throw new Error(`activity_type missing: ${t.key}`);
    ids.push(row.id);
  }
  return ids;
}

type DealRef = { id: string; ownerId: string; personId: string; orgId: string };

async function seedDealActivities(
  db: Db,
  deal: DealRef,
  typeIds: string[],
  assigneeIds: string[],
  rng: Rng,
): Promise<number> {
  const count = randInt(rng, 1, 15);
  let lastDoneMs: number | null = null;
  let nextDueMs: number | null = null;
  for (let k = 0; k < count; k += 1) {
    const roll = rng();
    const done = roll < 0.5;
    const overdue = !done && roll < 0.7;
    const offsetDays = randInt(rng, 1, 30);
    const dueMs =
      done || overdue ? Date.now() - offsetDays * DAY_MS : Date.now() + offsetDays * DAY_MS;
    const undated = !done && rng() < 0.1;
    if (done) lastDoneMs = Math.max(lastDoneMs ?? 0, dueMs);
    else if (!undated) nextDueMs = nextDueMs === null ? dueMs : Math.min(nextDueMs, dueMs);
    const duration = rng() < 0.4 ? randInt(rng, 1, 8) * 15 : null;
    await db.q(
      `INSERT INTO activities
         (type_id, subject, priority, done, done_at, due_at, duration_minutes,
          owner_id, assignee_id, deal_id, person_id, org_id)
       VALUES ($1,$2,$3,$4,
         CASE WHEN $4 THEN to_timestamp($5) ELSE NULL END,
         CASE WHEN $11 THEN NULL ELSE to_timestamp($5) END,
         $12,$6,$7,$8,$9,$10)`,
      [
        pick(rng, typeIds),
        `${pick(rng, SUBJECTS)} #${k + 1}`,
        pick(rng, ["Low", "Medium", "High"]),
        done,
        dueMs / 1000,
        deal.ownerId,
        pick(rng, assigneeIds),
        deal.id,
        deal.personId,
        deal.orgId,
        undated,
        duration,
      ],
    );
  }
  await db.q(
    `UPDATE deals SET
       last_activity_at = CASE WHEN $2::bigint IS NULL THEN NULL ELSE to_timestamp($2 / 1000.0) END,
       next_activity_at = CASE WHEN $3::bigint IS NULL THEN NULL ELSE to_timestamp($3 / 1000.0) END
     WHERE id = $1`,
    [deal.id, lastDoneMs, nextDueMs],
  );
  return count;
}

export async function insertActivities(
  db: Db,
  deals: DealRef[],
  typeIds: string[],
  assigneeIds: string[],
  rng: Rng,
): Promise<number> {
  let total = 0;
  for (const deal of deals) {
    total += await seedDealActivities(db, deal, typeIds, assigneeIds, rng);
  }
  return total;
}

export async function seedStandaloneActivities(
  db: Db,
  rng: Rng,
  n: number,
  userIds: string[],
  personIds: string[],
  orgIds: string[],
  typeIds: string[],
): Promise<number> {
  for (let i = 0; i < n; i += 1) {
    const link = rng();
    const personId = link < 0.5 ? pick(rng, personIds) : null;
    const orgId = link >= 0.5 && link < 0.8 ? pick(rng, orgIds) : null;
    const done = rng() < 0.4;
    const dueMs = done
      ? Date.now() - randInt(rng, 1, 20) * DAY_MS
      : Date.now() + randInt(rng, 1, 20) * DAY_MS;
    const owner = pick(rng, userIds);
    await db.q(
      `INSERT INTO activities
         (type_id, subject, priority, done, done_at, due_at, owner_id, assignee_id, person_id, org_id)
       VALUES ($1,$2,$3,$4,
         CASE WHEN $4 THEN to_timestamp($5) ELSE NULL END, to_timestamp($5),$6,$7,$8,$9)`,
      [
        pick(rng, typeIds),
        `${pick(rng, SUBJECTS)} (personal)`,
        pick(rng, ["Low", "Medium", "High"]),
        done,
        dueMs / 1000,
        owner,
        owner,
        personId,
        orgId,
      ],
    );
  }
  return n;
}
