import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@/db/schema";
import { brevoCampaigns, brevoContactCampaigns, brevoTrackedEmails } from "@/db/schema";

export {
  actorOf,
  SIG,
  seedDeal,
  seedLead,
  seedPerson,
} from "@/features/intercom/seed.test-helpers";

type Db = NodePgDatabase<typeof schema>;

export async function seedParticipant(db: Db, dealId: string, personId: string): Promise<void> {
  await db.execute(
    sql`INSERT INTO deal_participants (deal_id, person_id) VALUES (${dealId}, ${personId})`,
  );
}

export async function seedCampaign(
  db: Db,
  args: { id: number; name?: string; subject?: string | null; sentAt?: Date | null },
): Promise<void> {
  await db.insert(brevoCampaigns).values({
    id: args.id,
    name: args.name ?? `Campaign ${args.id}`,
    subject: args.subject ?? null,
    status: "sent",
    sentAt: args.sentAt ?? null,
  });
}

export async function seedContactCampaign(
  db: Db,
  args: Partial<typeof brevoContactCampaigns.$inferInsert> & { email: string; campaignId: number },
): Promise<void> {
  await db.insert(brevoContactCampaigns).values(args);
}

export async function trackedEmails(db: Db): Promise<Array<{ email: string; active: boolean }>> {
  const rows = await db.select().from(brevoTrackedEmails);
  return rows
    .map((r) => ({ email: r.email, active: r.active }))
    .sort((a, b) => a.email.localeCompare(b.email));
}
