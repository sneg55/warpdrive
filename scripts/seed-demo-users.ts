import { addToGroup, type Db, ensureDevIdentity, upsertUser } from "./seed-smoke-phase5-infra";

export type DemoUser = { email: string; name: string; admin: boolean };

type SetupResult = { userIds: string[]; westGroupId: string };

export async function setupDemoUsers(
  db: Db,
  users: DemoUser[],
  regularSetId: string,
  adminSetId: string,
  everyoneGroupId: string,
): Promise<SetupResult> {
  await db.q(
    `INSERT INTO visibility_groups (name) VALUES ('Demo West') ON CONFLICT (name) DO NOTHING`,
  );
  const [west] = await db.q<{ id: string }>(
    `SELECT id FROM visibility_groups WHERE name = 'Demo West' LIMIT 1`,
  );
  if (!west) throw new Error("Demo West group missing after upsert");

  const userIds: string[] = [];
  for (let i = 0; i < users.length; i += 1) {
    const u = users[i];
    if (!u) continue;
    const id = await upsertUser(
      db,
      u.email,
      u.name,
      u.admin,
      u.admin ? adminSetId : regularSetId,
      everyoneGroupId,
    );
    await addToGroup(db, id, everyoneGroupId);
    if (i === 1 || i === 2) await addToGroup(db, id, west.id);
    await db.q(
      `UPDATE users SET avatar_url = $2, last_seen_at = now() - ($3::int * interval '1 hour') WHERE id = $1`,
      [id, `https://i.pravatar.cc/150?u=${u.email}`, i * 3],
    );
    userIds.push(id);
  }

  const [formerRep] = await db.q<{ id: string }>(
    `INSERT INTO users (email, name, is_admin, is_active, permission_set_id, primary_visibility_group_id)
     VALUES ('demo6@example.com', 'Demo Former Rep', false, false, $1, $2)
     ON CONFLICT (email) DO UPDATE SET is_active = false, updated_at = now()
     RETURNING id`,
    [regularSetId, everyoneGroupId],
  );
  if (!formerRep) throw new Error("user upsert failed for demo6@example.com");
  await ensureDevIdentity(db, formerRep.id, "demo6@example.com");

  return { userIds, westGroupId: west.id };
}

export async function softDeleteSamples(
  db: Db,
  dealIds: string[],
  personIds: string[],
): Promise<void> {
  for (const id of dealIds.slice(0, 2)) {
    await db.q(`UPDATE deals SET deleted_at = now() WHERE id = $1`, [id]);
  }
  for (const id of personIds.slice(0, 2)) {
    await db.q(`UPDATE persons SET deleted_at = now() WHERE id = $1`, [id]);
  }
}
