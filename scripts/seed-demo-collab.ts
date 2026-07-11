/**
 * scripts/seed-demo-collab.ts
 *
 * Collaboration + peripheral state: notes (with comments/mentions), notifications,
 * file attachments, saved filters, and activity participants/guests. All rows are
 * demo-owned so wipeDemo clears them before reseeding.
 */

import { at, pick, type Rng, randInt } from "./seed-demo-data";
import type { Db } from "./seed-smoke-phase5-infra";

const NOTE_BODIES = [
  "Spoke with the champion; strong interest, needs sign-off from finance.",
  "Sent over the revised pricing. Waiting to hear back.",
  "Competitor is also in the mix. Emphasize onboarding support.",
  "Decision expected end of quarter.",
  "Technical eval passed. Legal review next.",
];
const FILE_NAMES = [
  ["Proposal.pdf", "application/pdf"],
  ["Contract.pdf", "application/pdf"],
  ["Pricing.xlsx", "application/vnd.ms-excel"],
  ["Deck.pptx", "application/vnd.ms-powerpoint"],
];
const NOTIF_TYPES = [
  "activity_assigned",
  "deal_won",
  "deal_followed_update",
  "email_open",
  "comment_reply",
];

type Targets = { deal: string[]; person: string[]; org: string[] };

async function noteOn(
  db: Db,
  rng: Rng,
  kind: string,
  id: string,
  userIds: string[],
): Promise<string> {
  const [row] = await db.q<{ id: string }>(
    `INSERT INTO notes (entity_type, entity_id, body, pinned, author_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [kind, id, pick(rng, NOTE_BODIES), rng() < 0.2, pick(rng, userIds)],
  );
  if (!row) throw new Error("note insert failed");
  return row.id;
}

export async function seedNotes(db: Db, rng: Rng, t: Targets, userIds: string[]): Promise<number> {
  const plan: Array<[string, string[], number]> = [
    ["deal", t.deal, 0.4],
    ["person", t.person, 0.2],
    ["organization", t.org, 0.3],
  ];
  let count = 0;
  for (const [kind, ids, frac] of plan) {
    for (const id of ids) {
      if (rng() >= frac) continue;
      const noteId = await noteOn(db, rng, kind, id, userIds);
      count += 1;
      // ~30% of notes get a comment + an @mention of another user, which also
      // lands a notification in that user's feed.
      if (rng() < 0.3) {
        const author = pick(rng, userIds);
        const mentioned = pick(rng, userIds);
        await db.q(`INSERT INTO comments (note_id, body, author_id) VALUES ($1, $2, $3)`, [
          noteId,
          "Good catch, following up.",
          author,
        ]);
        await db.q(
          `INSERT INTO mentions (source, source_id, mentioned_user_id, author_id) VALUES ('note', $1, $2, $3)`,
          [noteId, mentioned, author],
        );
        await db.q(
          `INSERT INTO notifications (user_id, type, entity_type, entity_id, actor_id, payload, read_at)
           VALUES ($1, 'mention', $2, $3, $4, $5::jsonb, NULL)`,
          [mentioned, kind, id, author, JSON.stringify({ note: "mentioned you in a note" })],
        );
      }
    }
  }
  return count;
}

export async function seedNotifications(
  db: Db,
  rng: Rng,
  userIds: string[],
  dealIds: string[],
): Promise<number> {
  let count = 0;
  for (const uid of userIds) {
    for (let k = 0; k < randInt(rng, 4, 8); k += 1) {
      const type = pick(rng, NOTIF_TYPES);
      const dealId = pick(rng, dealIds);
      await db.q(
        `INSERT INTO notifications (user_id, type, entity_type, entity_id, actor_id, payload, read_at)
         VALUES ($1, $2::notification_type, 'deal', $3, $4, $5::jsonb,
           CASE WHEN $6 THEN now() ELSE NULL END)`,
        [
          uid,
          type,
          dealId,
          pick(rng, userIds),
          JSON.stringify({ title: `${type} update` }),
          rng() < 0.5,
        ],
      );
      count += 1;
    }
  }
  return count;
}

export async function seedFiles(
  db: Db,
  rng: Rng,
  dealIds: string[],
  personIds: string[],
  userIds: string[],
): Promise<number> {
  let count = 0;
  const drop = async (kind: string, id: string): Promise<void> => {
    const f = pick(rng, FILE_NAMES);
    await db.q(
      `INSERT INTO files (entity_type, entity_id, filename, s3_key, size_bytes, content_type, uploaded_by, status)
       VALUES ($1::file_entity_type, $2, $3, $4, $5, $6, $7, 'ready')`,
      [
        kind,
        id,
        at(f, 0),
        `demo/${id}/${at(f, 0)}`,
        randInt(rng, 20, 900) * 1024,
        at(f, 1),
        pick(rng, userIds),
      ],
    );
    count += 1;
  };
  for (const id of dealIds)
    for (let k = 0; k < (rng() < 0.35 ? randInt(rng, 1, 2) : 0); k += 1) await drop("deal", id);
  for (const id of personIds) if (rng() < 0.1) await drop("person", id);
  return count;
}

export interface SavedFilterSeed {
  name: string;
  target: string;
  shared: boolean;
  ownerId: string;
  def: Record<string, unknown>;
}

// Builds the demo saved-filter rows. Definitions MUST conform to the saved-filters
// FilterDefinition schema (src/features/saved-filters/schemas.ts); a stored key the schema
// strips is a silent no-op (see scripts/auditConfig). Only "deal"-target filters are consumed
// (dealRouter.savedFilters queries target="deal"); activities have their own separate filter
// system and never read saved_filters, so no activity filter is seeded.
//
// "My open deals" is the owner's open deals. filterToSql has no access to the actor id, so the
// owner is bound into the definition as a concrete ownerId=eq condition alongside status=open.
export function buildSavedFilterSeeds(userIds: string[]): SavedFilterSeed[] {
  const seeds: SavedFilterSeed[] = [];
  const owner0 = userIds[0];
  if (owner0 !== undefined) {
    seeds.push({
      name: "My open deals",
      target: "deal",
      shared: false,
      ownerId: owner0,
      def: {
        conditions: [
          { field: "status", op: "eq", value: "open" },
          { field: "ownerId", op: "eq", value: owner0 },
        ],
      },
    });
  }
  const owner1 = userIds[1 % userIds.length];
  if (owner1 !== undefined) {
    seeds.push({
      name: "Rotting deals",
      target: "deal",
      shared: true,
      ownerId: owner1,
      def: { rotting: true },
    });
  }
  return seeds;
}

export async function seedSavedFilters(db: Db, userIds: string[]): Promise<void> {
  for (const s of buildSavedFilterSeeds(userIds)) {
    await db.q(
      `INSERT INTO saved_filters (name, target_entity, definition, owner_id, is_shared)
       VALUES ($1, $2, $3::jsonb, $4, $5)`,
      [s.name, s.target, JSON.stringify(s.def), s.ownerId, s.shared],
    );
  }
}

// Attaches user participants and person guests to a sample of demo activities.
export async function seedActivityExtras(
  db: Db,
  rng: Rng,
  userIds: string[],
  personIds: string[],
): Promise<number> {
  const rows = await db.q<{ id: string }>(
    `SELECT id FROM activities WHERE owner_id = ANY($1::uuid[]) ORDER BY created_at LIMIT 120`,
    [userIds],
  );
  let count = 0;
  for (const a of rows) {
    if (rng() < 0.5) {
      await db.q(
        `INSERT INTO activity_participants (activity_id, user_id, role) VALUES ($1, $2, 'attendee') ON CONFLICT DO NOTHING`,
        [a.id, pick(rng, userIds)],
      );
      count += 1;
    }
    if (rng() < 0.4) {
      await db.q(
        `INSERT INTO activity_guests (activity_id, person_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [a.id, pick(rng, personIds)],
      );
    }
  }
  return count;
}
