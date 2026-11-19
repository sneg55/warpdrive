import { randomUUID } from "node:crypto";
import * as schema from "@/db/schema";
import type { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import type { SearchResults } from "@/types/search";
import { searchAll } from "./query";

export type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

export function actorOf(
  id: string,
  type: "admin" | "regular" = "regular",
  groupIds: Set<string> = new Set(),
): PermSetUser {
  return { id, type, isActive: true, flags: new Set(), groupIds };
}

export async function run(db: TestDb, actor: PermSetUser, q: string): Promise<SearchResults> {
  const r = await searchAll(db, actor, q, new AbortController().signal);
  if (r.ok === false) throw r.error;
  return r.value;
}

export interface World {
  alice: typeof schema.users.$inferSelect;
  bob: typeof schema.users.$inferSelect;
  pipelineId: string;
  stageId: string;
  activityTypeId: string;
}

export async function seedWorld(db: TestDb): Promise<World> {
  const alice = await seedUser(db);
  const bob = await seedUser(db);
  const { pipeline, stages } = await seedPipelineWithStages(db, ["Discovery"]);
  const [type] = await db
    .insert(schema.activityTypes)
    .values({ key: `call-${randomUUID()}`, name: "Call" })
    .returning();
  return {
    alice,
    bob,
    pipelineId: pipeline.id,
    stageId: stages[0]?.id ?? "",
    activityTypeId: type?.id ?? "",
  };
}

type Visibility = "all" | "owner";

interface Owned {
  ownerId?: string;
  visibility?: Visibility;
}

export async function addDeal(
  db: TestDb,
  w: World,
  title: string,
  o: Owned & { customFields?: Record<string, unknown> } = {},
): Promise<string> {
  const [row] = await db
    .insert(schema.deals)
    .values({
      title,
      ownerId: o.ownerId ?? w.alice.id,
      visibilityLevel: o.visibility ?? "all",
      pipelineId: w.pipelineId,
      stageId: w.stageId,
      customFields: o.customFields ?? {},
    })
    .returning({ id: schema.deals.id });
  return row?.id ?? "";
}

export async function addPerson(
  db: TestDb,
  w: World,
  name: string,
  o: Owned & {
    email?: string;
    orgId?: string;
    customFields?: Record<string, unknown>;
  } = {},
): Promise<string> {
  const [row] = await db
    .insert(schema.persons)
    .values({
      name,
      primaryEmail: o.email ?? null,
      orgId: o.orgId ?? null,
      ownerId: o.ownerId ?? w.alice.id,
      visibilityLevel: o.visibility ?? "all",
      customFields: o.customFields ?? {},
    })
    .returning({ id: schema.persons.id });
  return row?.id ?? "";
}

export async function addOrg(
  db: TestDb,
  w: World,
  name: string,
  o: Owned & { domain?: string; customFields?: Record<string, unknown> } = {},
): Promise<string> {
  const [row] = await db
    .insert(schema.organizations)
    .values({
      name,
      domain: o.domain ?? null,
      ownerId: o.ownerId ?? w.alice.id,
      visibilityLevel: o.visibility ?? "all",
      customFields: o.customFields ?? {},
    })
    .returning({ id: schema.organizations.id });
  return row?.id ?? "";
}

export async function addLead(
  db: TestDb,
  w: World,
  title: string,
  o: Owned & { customFields?: Record<string, unknown>; archived?: boolean } = {},
): Promise<string> {
  const [row] = await db
    .insert(schema.leads)
    .values({
      title,
      ownerId: o.ownerId ?? w.alice.id,
      visibilityLevel: o.visibility ?? "all",
      customFields: o.customFields ?? {},
      archivedAt: o.archived === true ? new Date() : null,
    })
    .returning({ id: schema.leads.id });
  return row?.id ?? "";
}

export type Entity = "deal" | "person" | "organization" | "lead";

export async function addNote(
  db: TestDb,
  w: World,
  entityType: Entity,
  entityId: string,
  body: string,
  o: { deleted?: boolean; createdAt?: Date } = {},
): Promise<string> {
  const [row] = await db
    .insert(schema.notes)
    .values({
      entityType,
      entityId,
      body,
      authorId: w.alice.id,
      deletedAt: o.deleted === true ? new Date() : null,
      ...(o.createdAt === undefined ? {} : { createdAt: o.createdAt }),
    })
    .returning({ id: schema.notes.id });
  return row?.id ?? "";
}

export async function addActivity(
  db: TestDb,
  w: World,
  subject: string,
  o: {
    dealId?: string;
    personId?: string;
    orgId?: string;
    leadId?: string;
    note?: string;
    assigneeId?: string;
    dueAt?: Date;
    customFields?: Record<string, unknown>;
    deleted?: boolean;
  } = {},
): Promise<string> {
  const [row] = await db
    .insert(schema.activities)
    .values({
      typeId: w.activityTypeId,
      subject,
      ownerId: w.alice.id,
      assigneeId: o.assigneeId ?? w.alice.id,
      dealId: o.dealId ?? null,
      personId: o.personId ?? null,
      orgId: o.orgId ?? null,
      leadId: o.leadId ?? null,
      note: o.note ?? null,
      dueAt: o.dueAt ?? null,
      customFields: o.customFields ?? {},
      deletedAt: o.deleted === true ? new Date() : null,
    })
    .returning({ id: schema.activities.id });
  return row?.id ?? "";
}

export async function addPersonalMailbox(db: TestDb, userId: string): Promise<string> {
  const [row] = await db
    .insert(schema.emailAccounts)
    .values({ emailAddress: `box-${randomUUID()}@example.com`, userId, kind: "personal" })
    .returning({ id: schema.emailAccounts.id });
  return row?.id ?? "";
}

export async function addTeamMailbox(db: TestDb, memberIds: string[]): Promise<string> {
  const [row] = await db
    .insert(schema.emailAccounts)
    .values({ emailAddress: `team-${randomUUID()}@example.com`, userId: null, kind: "team" })
    .returning({ id: schema.emailAccounts.id });
  const id = row?.id ?? "";
  if (memberIds.length > 0) {
    await db
      .insert(schema.emailAccountMembers)
      .values(memberIds.map((userId) => ({ accountId: id, userId })));
  }
  return id;
}

export interface ThreadSeed {
  accountId: string;
  subject?: string;
  dealId?: string;
  personId?: string;
  leadId?: string;
  visibility?: "private" | "shared";
  trashed?: boolean;
  message?: {
    subject?: string;
    bodyText?: string | null;
    bodyHtml?: string | null;
    fromName?: string;
    fromEmail?: string;
    sentAt?: Date;
  };
}

export async function addThread(db: TestDb, t: ThreadSeed): Promise<string> {
  const [row] = await db
    .insert(schema.emailThreads)
    .values({
      gmailThreadId: randomUUID(),
      accountId: t.accountId,
      subject: t.subject ?? null,
      dealId: t.dealId ?? null,
      personId: t.personId ?? null,
      leadId: t.leadId ?? null,
      visibility: t.visibility ?? "shared",
      trashedAt: t.trashed === true ? new Date() : null,
    })
    .returning({ id: schema.emailThreads.id });
  const id = row?.id ?? "";
  if (t.message !== undefined) {
    await db.insert(schema.emailMessages).values({
      threadId: id,
      accountId: t.accountId,
      gmailMessageId: randomUUID(),
      direction: "inbound",
      fromEmail: t.message.fromEmail ?? "sender@example.com",
      fromName: t.message.fromName ?? null,
      subject: t.message.subject ?? null,
      bodyText: t.message.bodyText ?? null,
      bodyHtml: t.message.bodyHtml ?? null,
      sentAt: t.message.sentAt ?? new Date(),
    });
  }
  return id;
}
