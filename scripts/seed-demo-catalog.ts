/**
 * scripts/seed-demo-catalog.ts
 *
 * Shared catalog rows (labels, lost reasons, custom-field defs) plus owner-scoped
 * extras (teams, email templates, signatures). Catalogs are idempotent by natural
 * key so they coexist with smoke fixtures; extras are recreated each run (wipeDemo
 * clears the demo-owned ones first).
 */

import { DEFAULT_LABELS } from "@/constants/defaultCatalog";
import { DEAL_SOURCES, INDUSTRIES } from "./seed-demo-data";
import type { Db } from "./seed-smoke-phase5-infra";

export type LabelIds = { deal: string[]; person: string[]; org: string[] };

// Demo catalog labels come from the shared first-run defaults so demo data and a fresh
// install stay identical. Mapped to mutable string[][] for ensureLabels.
const toDefs = (target: keyof typeof DEFAULT_LABELS): string[][] =>
  DEFAULT_LABELS[target].map(([name, color]) => [name, color]);

const DEAL_LABELS = toDefs("deal");
const PERSON_LABELS = toDefs("person");
const ORG_LABELS = toDefs("organization");
const LEAD_LABELS = toDefs("lead");
const LOST_REASONS = [
  "Price too high",
  "Went with competitor",
  "No budget",
  "No decision",
  "Bad timing",
];

async function ensureLabel(
  db: Db,
  target: string,
  name: string,
  color: string,
  order: number,
): Promise<string> {
  const [ex] = await db.q<{ id: string }>(
    `SELECT id FROM labels WHERE target = $1::label_target AND name = $2 LIMIT 1`,
    [target, name],
  );
  if (ex) return ex.id;
  const [row] = await db.q<{ id: string }>(
    `INSERT INTO labels (target, name, color, "order")
     VALUES ($1::label_target, $2, $3::label_color, $4) RETURNING id`,
    [target, name, color, order],
  );
  if (!row) throw new Error(`label insert failed: ${target}/${name}`);
  return row.id;
}

async function ensureLabels(db: Db, target: string, defs: string[][]): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < defs.length; i += 1) {
    const d = defs[i] ?? [];
    ids.push(await ensureLabel(db, target, d[0] ?? "", d[1] ?? "gray", i));
  }
  return ids;
}

export async function seedLabels(db: Db): Promise<LabelIds> {
  const ids = {
    deal: await ensureLabels(db, "deal", DEAL_LABELS),
    person: await ensureLabels(db, "person", PERSON_LABELS),
    org: await ensureLabels(db, "organization", ORG_LABELS),
  };
  // Lead labels exist in the catalog for parity with production defaults, though the demo
  // record builders do not apply them, so their ids are not returned.
  await ensureLabels(db, "lead", LEAD_LABELS);
  return ids;
}

export async function seedLostReasons(db: Db): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < LOST_REASONS.length; i += 1) {
    const name = LOST_REASONS[i] ?? "";
    const [ex] = await db.q<{ id: string }>(`SELECT id FROM lost_reasons WHERE name = $1 LIMIT 1`, [
      name,
    ]);
    if (ex) {
      ids.push(ex.id);
      continue;
    }
    const [row] = await db.q<{ id: string }>(
      `INSERT INTO lost_reasons (name, "order") VALUES ($1, $2) RETURNING id`,
      [name, i],
    );
    if (!row) throw new Error(`lost_reason insert failed: ${name}`);
    ids.push(row.id);
  }
  return ids;
}

// Deal custom-field defs whose keys match buildDeals() (industry, deal_source).
// Single-option values are stored as the option id, so we set id == label.
export async function seedCustomFieldDefs(db: Db): Promise<void> {
  // is_important pins the field to the summary panel; show_in_add_form surfaces it
  // in the add-deal modal (both migration 0036). Industry is flagged as important.
  const defs = [
    { key: "industry", name: "Industry", options: INDUSTRIES, important: true, inAddForm: true },
    {
      key: "deal_source",
      name: "Deal Source",
      options: DEAL_SOURCES,
      important: false,
      inAddForm: true,
    },
  ];
  for (let i = 0; i < defs.length; i += 1) {
    const d = defs[i];
    if (!d) continue;
    const [ex] = await db.q<{ id: string }>(
      `SELECT id FROM custom_field_defs WHERE target_entity = 'deal' AND key = $1 LIMIT 1`,
      [d.key],
    );
    if (ex) {
      // Backfill the flags on a pre-existing def so reseeds over an older catalog
      // still exercise the important/add-form states.
      await db.q(
        `UPDATE custom_field_defs SET is_important = $2, show_in_add_form = $3 WHERE id = $1`,
        [ex.id, d.important, d.inAddForm],
      );
      continue;
    }
    const options = JSON.stringify(d.options.map((v) => ({ id: v, label: v })));
    await db.q(
      `INSERT INTO custom_field_defs
         (target_entity, type, name, key, options, "order", is_important, show_in_add_form)
       VALUES ('deal', 'single_option', $1, $2, $3::jsonb, $4, $5, $6)`,
      [d.name, d.key, options, i, d.important, d.inAddForm],
    );
  }
}

// Two teams over the 5 demo users; managers are demo2 and demo4. Demo-owned, so
// wipeDemo clears prior copies before this runs.
export async function seedTeams(db: Db, userIds: string[]): Promise<void> {
  const teams = [
    { name: "West Team", managerIdx: 1, memberIdx: [1, 2] },
    { name: "East Team", managerIdx: 3, memberIdx: [3, 4] },
  ];
  for (const t of teams) {
    const managerId = userIds[t.managerIdx];
    if (managerId === undefined) continue;
    const [row] = await db.q<{ id: string }>(
      `INSERT INTO teams (name, manager_id) VALUES ($1, $2) RETURNING id`,
      [t.name, managerId],
    );
    if (!row) throw new Error(`team insert failed: ${t.name}`);
    for (const mi of t.memberIdx) {
      const uid = userIds[mi];
      if (uid === undefined) continue;
      await db.q(
        `INSERT INTO team_members (team_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [row.id, uid],
      );
    }
  }
}

export async function seedEmailTemplates(db: Db, ownerId: string): Promise<void> {
  const tpls = [
    {
      name: "Intro outreach",
      subject: "Quick intro",
      body: "<p>Hi {{first_name}}, wanted to introduce myself.</p>",
    },
    {
      name: "Follow-up",
      subject: "Following up",
      body: "<p>Just circling back on my last note.</p>",
    },
    {
      name: "Proposal cover",
      subject: "Your proposal",
      body: "<p>Attached is the proposal we discussed.</p>",
    },
  ];
  for (const t of tpls) {
    await db.q(
      `INSERT INTO email_templates (name, subject, body_html, owner_id, is_shared)
       VALUES ($1, $2, $3, $4, true)`,
      [t.name, t.subject, t.body, ownerId],
    );
  }
}

export async function seedSignatures(db: Db, userIds: string[], names: string[]): Promise<void> {
  for (let i = 0; i < userIds.length; i += 1) {
    const uid = userIds[i];
    if (uid === undefined) continue;
    const who = names[i] ?? "Demo User";
    await db.q(
      `INSERT INTO signatures (user_id, name, body_html, is_default)
       VALUES ($1, 'Default', $2, true)`,
      [uid, `<p>Best,<br>${who}</p>`],
    );
  }
}
