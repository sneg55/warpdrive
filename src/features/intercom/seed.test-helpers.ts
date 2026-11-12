import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@/db/schema";
import {
  intercomContacts,
  intercomConversationContacts,
  intercomConversationParts,
  intercomConversations,
} from "@/db/schema";
import { seedPipelineWithStages } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";

type Db = NodePgDatabase<typeof schema>;

export const SIG = (): AbortSignal => new AbortController().signal;

export function actorOf(id: string, type: "regular" | "admin" = "regular"): PermSetUser {
  return { id, type, isActive: true, flags: new Set(), groupIds: new Set<string>() };
}

export async function seedPerson(
  db: Db,
  args: { ownerId: string; email?: string | null; emails?: string[]; level?: string },
): Promise<string> {
  const emails = JSON.stringify((args.emails ?? []).map((value) => ({ label: "work", value })));
  const row = (
    await db.execute(sql`
      INSERT INTO persons (name, primary_email, emails, owner_id, visibility_level)
      VALUES ('Pat', ${args.email ?? null}, ${emails}::jsonb, ${args.ownerId}, ${args.level ?? "all"})
      RETURNING id`)
  ).rows[0] as { id: string };
  return row.id;
}

export async function seedDeal(
  db: Db,
  args: { ownerId: string; personId?: string | null; level?: string },
): Promise<string> {
  const { pipeline, stages } = await seedPipelineWithStages(db, ["Open"]);
  const row = (
    await db.execute(sql`
      INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level, person_id)
      VALUES ('Deal', ${pipeline.id}, ${stages[0]?.id ?? null}, ${args.ownerId},
              ${args.level ?? "all"}, ${args.personId ?? null})
      RETURNING id`)
  ).rows[0] as { id: string };
  return row.id;
}

export async function seedLead(
  db: Db,
  args: { ownerId: string; personId: string | null; level?: string },
): Promise<string> {
  const row = (
    await db.execute(sql`
      INSERT INTO leads (title, owner_id, person_id, visibility_level)
      VALUES ('Lead', ${args.ownerId}, ${args.personId}, ${args.level ?? "all"})
      RETURNING id`)
  ).rows[0] as { id: string };
  return row.id;
}

export interface SeedConversation {
  id: string;
  contactEmails: Array<string | null>;
  title?: string | null;
  lastPartAt?: Date;
  parts?: Array<{ id: string; partType: string; body?: string }>;
}

export async function seedConversation(db: Db, c: SeedConversation): Promise<void> {
  const at = c.lastPartAt ?? new Date("2026-10-01T10:00:00Z");
  await db.insert(intercomConversations).values({
    id: c.id,
    title: c.title ?? null,
    state: "open",
    snippet: `Snippet ${c.id}`,
    createdAt: at,
    updatedAt: at,
    lastPartAt: at,
    messageCount: c.parts?.length ?? 1,
    lastReplierName: "Agent",
    lastReplierType: "admin",
  });
  for (const [i, email] of c.contactEmails.entries()) {
    const contactId = `${c.id}-k${i}`;
    await db.insert(intercomContacts).values({ id: contactId, email, role: "user" });
    await db.insert(intercomConversationContacts).values({ conversationId: c.id, contactId });
  }
  const parts = c.parts ?? [{ id: `source-${c.id}`, partType: "source" }];
  for (const [i, p] of parts.entries()) {
    await db.insert(intercomConversationParts).values({
      id: p.id,
      conversationId: c.id,
      partType: p.partType,
      authorType: "user",
      authorName: "Pat",
      bodyHtml: p.body ?? `<p>${p.id}</p>`,
      createdAt: new Date(at.getTime() + i * 1000),
    });
  }
}
