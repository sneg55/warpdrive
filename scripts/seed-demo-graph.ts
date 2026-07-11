/**
 * scripts/seed-demo-graph.ts
 *
 * Contact-graph and identity fixtures introduced by Wave 3 (migrations 0035,
 * 0038, 0039): organization relations, contact followers, and a pending invited
 * user (google_sub NULL + invited_at set, i.e. invited but not yet SSO-adopted).
 */

import { ORG_RELATION_TYPES, pick, type Rng, randInt } from "./seed-demo-data";
import type { Db } from "./seed-smoke-phase5-infra";

// Links a sample of orgs to a neighbor with a free-text relation label. Uses
// distinct source/target (the table forbids self-relation) and is idempotent on
// the (source, target) primary key. Returns the number of relations created.
export async function seedOrgRelations(db: Db, rng: Rng, orgIds: string[]): Promise<number> {
  if (orgIds.length < 2) return 0;
  let created = 0;
  for (let i = 0; i < orgIds.length; i += 1) {
    // ~25% of orgs get a relation to a different org.
    if (rng() >= 0.25) continue;
    const source = orgIds[i];
    let j = randInt(rng, 0, orgIds.length - 1);
    if (j === i) j = (j + 1) % orgIds.length;
    const target = orgIds[j];
    if (source === undefined || target === undefined || source === target) continue;
    await db.q(
      `INSERT INTO organization_relations (source_org_id, target_org_id, relation_type)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [source, target, pick(rng, ORG_RELATION_TYPES)],
    );
    created += 1;
  }
  return created;
}

// Adds 1-2 demo-user followers to a sample of persons and organizations so the
// followers panel and the "following" filters have data. Returns rows created.
export async function seedContactFollowers(
  db: Db,
  rng: Rng,
  personIds: string[],
  orgIds: string[],
  userIds: string[],
): Promise<number> {
  if (userIds.length === 0) return 0;
  let created = 0;
  const follow = async (entityType: "person" | "organization", ids: string[], rate: number) => {
    for (const id of ids) {
      if (rng() >= rate) continue;
      const n = randInt(rng, 1, 2);
      for (let k = 0; k < n; k += 1) {
        const uid = pick(rng, userIds);
        const [row] = await db.q<{ ok: boolean }>(
          `INSERT INTO contact_followers (entity_type, entity_id, user_id)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING true AS ok`,
          [entityType, id, uid],
        );
        if (row) created += 1;
      }
    }
  };
  await follow("person", personIds, 0.3);
  await follow("organization", orgIds, 0.4);
  return created;
}

// A pending invited user: google_sub NULL means they have not completed SSO, and
// invited_at drives the "Invited" state in the users settings list (migration 0035).
export async function seedInvitedUser(
  db: Db,
  regularSetId: string,
  everyoneGroupId: string,
): Promise<void> {
  await db.q(
    `INSERT INTO users
       (email, name, google_sub, is_admin, is_active, permission_set_id,
        primary_visibility_group_id, invited_at)
     VALUES ('demo-invited@example.com', 'Demo Invited Rep', NULL, false, true, $1, $2,
        now() - interval '2 days')
     ON CONFLICT (email) DO UPDATE
       SET google_sub = NULL, invited_at = now() - interval '2 days',
           is_active = true, updated_at = now()`,
    [regularSetId, everyoneGroupId],
  );
}
