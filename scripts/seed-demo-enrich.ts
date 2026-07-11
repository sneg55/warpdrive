/**
 * scripts/seed-demo-enrich.ts
 *
 * Post-insert enrichment that needs generated ids: label chips, lost reasons on
 * lost deals, deal participants/followers, and lead -> deal conversion.
 */

import type { LabelIds } from "./seed-demo-catalog";
import { at, type DealSeed, type LeadSeed, pick, type Rng, randInt } from "./seed-demo-data";
import type { Db } from "./seed-smoke-phase5-infra";

async function link(
  db: Db,
  table: string,
  col: string,
  rowId: string,
  labelId: string,
): Promise<void> {
  await db.q(`INSERT INTO ${table} (${col}, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
    rowId,
    labelId,
  ]);
}

async function applyN(
  db: Db,
  rng: Rng,
  table: string,
  col: string,
  ids: string[],
  labels: string[],
  max: number,
): Promise<void> {
  for (const id of ids) {
    const n = randInt(rng, 0, max);
    for (let k = 0; k < n; k += 1) await link(db, table, col, id, pick(rng, labels));
  }
}

export async function applyLabels(
  db: Db,
  rng: Rng,
  dealIds: string[],
  personIds: string[],
  orgIds: string[],
  labels: LabelIds,
): Promise<void> {
  await applyN(db, rng, "deal_labels", "deal_id", dealIds, labels.deal, 2);
  await applyN(db, rng, "person_labels", "person_id", personIds, labels.person, 2);
  await applyN(db, rng, "org_labels", "org_id", orgIds, labels.org, 1);
}

export async function applyLostReasons(
  db: Db,
  rng: Rng,
  dealIds: string[],
  dealSeeds: DealSeed[],
  reasonIds: string[],
): Promise<void> {
  for (let i = 0; i < dealSeeds.length; i += 1) {
    if (dealSeeds[i]?.status !== "lost") continue;
    await db.q(`UPDATE deals SET lost_reason_id = $2 WHERE id = $1`, [
      at(dealIds, i),
      pick(rng, reasonIds),
    ]);
  }
}

export async function seedParticipantsFollowers(
  db: Db,
  rng: Rng,
  dealIds: string[],
  dealOwnerIds: string[],
  personIds: string[],
  userIds: string[],
): Promise<void> {
  for (let i = 0; i < dealIds.length; i += 1) {
    const dealId = at(dealIds, i);
    // Owner always follows; add 0-2 more colleagues.
    await db.q(
      `INSERT INTO deal_followers (deal_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [dealId, at(dealOwnerIds, i)],
    );
    for (let k = 0; k < randInt(rng, 0, 2); k += 1) {
      await db.q(
        `INSERT INTO deal_followers (deal_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [dealId, pick(rng, userIds)],
      );
    }
    // 0-2 person participants with a role.
    for (let k = 0; k < randInt(rng, 0, 2); k += 1) {
      await db.q(
        `INSERT INTO deal_participants (deal_id, person_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [
          dealId,
          pick(rng, personIds),
          pick(rng, ["decision maker", "influencer", "technical", "billing"]),
        ],
      );
    }
  }
}

// Creates a deal from each convert=true lead, points converted_deal_id at it, and
// archives the lead out of the inbox. Returns the number converted.
export async function convertLeads(
  db: Db,
  rng: Rng,
  leadIds: string[],
  leadSeeds: LeadSeed[],
  personIds: string[],
  orgIds: string[],
  pipelineId: string,
  stageId: string,
): Promise<number> {
  let converted = 0;
  for (let i = 0; i < leadSeeds.length; i += 1) {
    const l = leadSeeds[i];
    if (l?.convert !== true) continue;
    const [deal] = await db.q<{ id: string }>(
      `INSERT INTO deals
         (title, status, value, pipeline_id, stage_id, board_position,
          person_id, org_id, owner_id, visibility_level)
       VALUES ($1, 'open', $2, $3, $4, $5, $6, $7, $8, 'all') RETURNING id`,
      [
        `${l.title} (converted)`,
        l.value,
        pipelineId,
        stageId,
        randInt(rng, 0, 20),
        l.personIdx === null ? null : at(personIds, l.personIdx),
        l.orgIdx === null ? null : at(orgIds, l.orgIdx),
        l.ownerId,
      ],
    );
    if (!deal) throw new Error(`lead conversion deal insert failed: ${l.title}`);
    await db.q(`UPDATE leads SET converted_deal_id = $2, archived_at = now() WHERE id = $1`, [
      at(leadIds, i),
      deal.id,
    ]);
    converted += 1;
  }
  return converted;
}
