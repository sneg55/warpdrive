import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { expect, it } from "vitest";
import type { Db } from "@/db/client";
import {
  contactFollowers,
  emailAccounts,
  emailThreads,
  leads,
  organizations,
  persons,
  prospectReveals,
} from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { mergeOrgs, mergePersons } from "./merge";
import { adminActor } from "./mergeTestActors";

async function seedPerson(db: Db, ownerId: string, name: string): Promise<string> {
  const [row] = await db
    .insert(persons)
    .values({ name, ownerId, visibilityLevel: "all" })
    .returning({ id: persons.id });
  if (row === undefined) throw new Error("person seed failed");
  return row.id;
}

async function seedOrg(db: Db, ownerId: string, name: string): Promise<string> {
  const [row] = await db
    .insert(organizations)
    .values({ name, ownerId, visibilityLevel: "all" })
    .returning({ id: organizations.id });
  if (row === undefined) throw new Error("org seed failed");
  return row.id;
}

async function seedReveal(
  db: Db,
  requestedBy: string,
  orgId: string,
  personId: string | null,
): Promise<string> {
  const [row] = await db
    .insert(prospectReveals)
    .values({
      batchId: randomUUID(),
      orgId,
      requestedBy,
      providerRef: randomUUID(),
      searchProvider: "apollo",
      profile: { name: "P" } as never,
      outcomes: [],
      personId,
    })
    .returning({ id: prospectReveals.id });
  if (row === undefined) throw new Error("reveal seed failed");
  return row.id;
}

async function followerIds(
  db: Db,
  entityType: "person" | "organization",
  entityId: string,
): Promise<string[]> {
  const rows = await db
    .select({ userId: contactFollowers.userId })
    .from(contactFollowers)
    .where(
      and(eq(contactFollowers.entityType, entityType), eq(contactFollowers.entityId, entityId)),
    );
  return rows.map((r) => r.userId).sort();
}

async function followFollowersCase(
  db: Db,
  entityType: "person" | "organization",
  survivorId: string,
  mergedId: string,
): Promise<{ onlyMerged: string; both: string }> {
  const onlyMerged = await seedUser(db);
  const both = await seedUser(db);
  await db.insert(contactFollowers).values([
    { entityType, entityId: mergedId, userId: onlyMerged.id },
    { entityType, entityId: mergedId, userId: both.id },
    { entityType, entityId: survivorId, userId: both.id },
  ]);
  return { onlyMerged: onlyMerged.id, both: both.id };
}

it("a person merge moves the merged person's followers onto the survivor without duplicates", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const survivorId = await seedPerson(db, user.id, "Jane Roe");
    const mergedId = await seedPerson(db, user.id, "J. Roe");
    const f = await followFollowersCase(db, "person", survivorId, mergedId);

    const r = await mergePersons(
      db,
      adminActor(user.id),
      { survivorId, mergedId, fieldChoices: { name: "Jane Roe" } },
      signal,
    );
    expect(r.ok).toBe(true);
    expect(await followerIds(db, "person", survivorId)).toEqual([f.onlyMerged, f.both].sort());
    expect(await followerIds(db, "person", mergedId)).toEqual([]);
  });
});

it("an org merge moves the merged org's followers onto the survivor without duplicates", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const survivorId = await seedOrg(db, user.id, "Acme");
    const mergedId = await seedOrg(db, user.id, "Acme Inc");
    const f = await followFollowersCase(db, "organization", survivorId, mergedId);

    const r = await mergeOrgs(
      db,
      adminActor(user.id),
      { survivorId, mergedId, fieldChoices: { name: "Acme" } },
      signal,
    );
    expect(r.ok).toBe(true);
    expect(await followerIds(db, "organization", survivorId)).toEqual(
      [f.onlyMerged, f.both].sort(),
    );
    expect(await followerIds(db, "organization", mergedId)).toEqual([]);
  });
});

it("a person merge repoints the merged person's leads, email threads and prospect reveals", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const survivorId = await seedPerson(db, user.id, "Jane Roe");
    const mergedId = await seedPerson(db, user.id, "J. Roe");
    const orgId = await seedOrg(db, user.id, "Acme");

    const [lead] = await db
      .insert(leads)
      .values({ title: "L", ownerId: user.id, visibilityLevel: "all", personId: mergedId })
      .returning({ id: leads.id });
    const [account] = await db
      .insert(emailAccounts)
      .values({ userId: user.id, emailAddress: "o@acme.test", status: "connected" })
      .returning({ id: emailAccounts.id });
    if (lead === undefined || account === undefined) throw new Error("setup failed");
    const [thread] = await db
      .insert(emailThreads)
      .values({ gmailThreadId: "t-merge", accountId: account.id, personId: mergedId })
      .returning({ id: emailThreads.id });
    if (thread === undefined) throw new Error("thread seed failed");
    const revealId = await seedReveal(db, user.id, orgId, mergedId);

    const r = await mergePersons(
      db,
      adminActor(user.id),
      { survivorId, mergedId, fieldChoices: { name: "Jane Roe" } },
      signal,
    );
    expect(r.ok).toBe(true);

    const [leadAfter] = await db.select().from(leads).where(eq(leads.id, lead.id));
    const [threadAfter] = await db
      .select()
      .from(emailThreads)
      .where(eq(emailThreads.id, thread.id));
    const [revealAfter] = await db
      .select()
      .from(prospectReveals)
      .where(eq(prospectReveals.id, revealId));
    expect(leadAfter?.personId).toBe(survivorId);
    expect(threadAfter?.personId).toBe(survivorId);
    expect(revealAfter?.personId).toBe(survivorId);
  });
});

it("an org merge repoints the merged org's leads and prospect reveals", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const survivorId = await seedOrg(db, user.id, "Acme");
    const mergedId = await seedOrg(db, user.id, "Acme Inc");

    const [lead] = await db
      .insert(leads)
      .values({ title: "L", ownerId: user.id, visibilityLevel: "all", orgId: mergedId })
      .returning({ id: leads.id });
    if (lead === undefined) throw new Error("lead seed failed");
    const revealId = await seedReveal(db, user.id, mergedId, null);

    const r = await mergeOrgs(
      db,
      adminActor(user.id),
      { survivorId, mergedId, fieldChoices: { name: "Acme" } },
      signal,
    );
    expect(r.ok).toBe(true);

    const [leadAfter] = await db.select().from(leads).where(eq(leads.id, lead.id));
    const [revealAfter] = await db
      .select()
      .from(prospectReveals)
      .where(eq(prospectReveals.id, revealId));
    expect(leadAfter?.orgId).toBe(survivorId);
    expect(revealAfter?.orgId).toBe(survivorId);
  });
});
