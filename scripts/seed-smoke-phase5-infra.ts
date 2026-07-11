/**
 * scripts/seed-smoke-phase5-infra.ts
 *
 * Infrastructure seeders: Db type, settings, permission sets, visibility groups, users.
 * All functions are idempotent.
 */

import type { Pool } from "pg";

export type Db = {
  q: <T extends Record<string, unknown>>(text: string, values?: unknown[]) => Promise<T[]>;
};

export function makeDb(pool: Pool): Db {
  return {
    q: async <T extends Record<string, unknown>>(text: string, values?: unknown[]) => {
      const result = await pool.query(text, values);
      return result.rows as T[];
    },
  };
}

export async function seedSettings(db: Db): Promise<void> {
  await db.q(
    `INSERT INTO settings (id, base_currency, email_tracking_default_enabled)
     VALUES (true, 'USD', true)
     ON CONFLICT (id) DO NOTHING`,
  );
}

export async function seedPermissionSets(
  db: Db,
): Promise<{ regularSetId: string; adminSetId: string }> {
  const regularFlags = JSON.stringify({
    "deal.create": true,
    "contact.create": true,
    "activity.create": true,
    "deal.edit_own": true,
    "contact.edit_own": true,
    "activity.edit_own": true,
    "record.share_own": true,
    "stats.viewOthers": false,
  });
  const adminFlags = JSON.stringify({
    "deal.create": true,
    "contact.create": true,
    "activity.create": true,
    "bulk.edit": true,
    "data.import": true,
    "data.export": true,
    "filter.share": true,
    "stats.viewOthers": true,
    "pipeline.manage": true,
    "metadata.manage": true,
    "permissions.manage": true,
    "deal.edit_own": true,
    "deal.edit_any": true,
    "deal.delete_own": true,
    "deal.delete_any": true,
    "deal.changeOwner_own": true,
    "deal.changeOwner_any": true,
    "contact.edit_own": true,
    "contact.edit_any": true,
    "contact.delete_own": true,
    "contact.delete_any": true,
    "contact.merge_own": true,
    "contact.merge_any": true,
    "activity.edit_own": true,
    "activity.edit_any": true,
    "activity.delete_own": true,
    "activity.delete_any": true,
    "record.share_own": true,
    "record.share_any": true,
  });
  await db.q(
    `INSERT INTO permission_sets (name, flags, is_default) VALUES ('Regular', $1::jsonb, true)
     ON CONFLICT (name) DO UPDATE SET flags = EXCLUDED.flags, is_default = true`,
    [regularFlags],
  );
  await db.q(
    `INSERT INTO permission_sets (name, flags, is_default) VALUES ('Admin', $1::jsonb, false)
     ON CONFLICT (name) DO UPDATE SET flags = EXCLUDED.flags, is_default = false`,
    [adminFlags],
  );
  const [regular] = await db.q<{ id: string }>(
    `SELECT id FROM permission_sets WHERE name = 'Regular' LIMIT 1`,
  );
  const [admin] = await db.q<{ id: string }>(
    `SELECT id FROM permission_sets WHERE name = 'Admin' LIMIT 1`,
  );
  if (!regular || !admin) throw new Error("permission_sets seeding failed");
  return { regularSetId: regular.id, adminSetId: admin.id };
}

export async function seedVisibilityGroups(
  db: Db,
): Promise<{ everyoneGroupId: string; restrictedGroupId: string }> {
  await db.q(
    `INSERT INTO visibility_groups (name) VALUES ('Everyone') ON CONFLICT (name) DO NOTHING`,
  );
  await db.q(
    `INSERT INTO visibility_groups (name) VALUES ('RestrictedGroup') ON CONFLICT (name) DO NOTHING`,
  );
  const [everyone] = await db.q<{ id: string }>(
    `SELECT id FROM visibility_groups WHERE name = 'Everyone' LIMIT 1`,
  );
  const [restricted] = await db.q<{ id: string }>(
    `SELECT id FROM visibility_groups WHERE name = 'RestrictedGroup' LIMIT 1`,
  );
  if (!everyone || !restricted) throw new Error("visibility_groups seeding failed");
  return { everyoneGroupId: everyone.id, restrictedGroupId: restricted.id };
}

export async function upsertUser(
  db: Db,
  email: string,
  name: string,
  isAdmin: boolean,
  permissionSetId: string,
  everyoneGroupId: string,
): Promise<string> {
  const [row] = await db.q<{ id: string }>(
    `INSERT INTO users
       (email, name, google_sub, is_admin, is_active, permission_set_id, primary_visibility_group_id)
     VALUES ($1, $2, $3, $4, true, $5, $6)
     ON CONFLICT (email) DO UPDATE
       SET name = EXCLUDED.name, google_sub = EXCLUDED.google_sub,
           is_admin = EXCLUDED.is_admin, is_active = true,
           permission_set_id = EXCLUDED.permission_set_id,
           primary_visibility_group_id = EXCLUDED.primary_visibility_group_id,
           updated_at = now()
     RETURNING id`,
    [email, name, `dev-${email}`, isAdmin, permissionSetId, everyoneGroupId],
  );
  if (!row) throw new Error(`user upsert failed for ${email}`);
  return row.id;
}

export async function addToGroup(db: Db, userId: string, groupId: string): Promise<void> {
  await db.q(
    `INSERT INTO visibility_group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [groupId, userId],
  );
}
