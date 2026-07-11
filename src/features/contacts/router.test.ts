import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { activities, activityTypes, persons } from "@/db/schema";
import { seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { makeCaller } from "@/server/testCaller";
import { makeTestDb } from "@/test/db";
import { followContact } from "./followers";
import { type ContactActor, createPerson } from "./personsRepo";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.close();
});

function makeActor(user: { id: string; isAdmin: boolean }): PermSetUser {
  return {
    id: user.id,
    type: user.isAdmin ? "admin" : "regular",
    isActive: true,
    groupIds: new Set<string>(),
    flags: new Set(["contact.create" as const]),
  };
}

function toContactActor(actor: PermSetUser): ContactActor {
  return {
    id: actor.id,
    type: actor.type,
    isActive: actor.isActive,
    groupIds: actor.groupIds,
    flags: actor.flags,
    primaryVisibilityGroupId: null,
  };
}

it("creates a person via the repo and reads it back via the router", async () => {
  const user = await seedUser(ctx.db);
  const actor = makeActor(user);
  const caller = makeCaller(ctx.db, actor);

  // Use the repo directly for create: actions require guardCsrf cookies/headers
  // infrastructure that is not available in the test container environment.
  const created = await createPerson(
    ctx.db,
    toContactActor(actor),
    {
      name: "Jane Roe",
      emails: [{ label: "work", value: "jane@a.com", primary: true }],
      phones: [],
      orgId: null,
      customFields: {},
    },
    AbortSignal.timeout(10_000),
  );
  if (!created.ok) throw new Error(`createPerson failed: ${created.error.message}`);

  const got = await caller.contacts.getPerson({ id: created.value.id });
  expect(got.name).toBe("Jane Roe");
});

it("throws NOT_FOUND through tRPC for a person the caller cannot see", async () => {
  const owner = await seedUser(ctx.db);
  const ownerActor = makeActor(owner);

  // Owner-level visibility (settings empty fallback): only the owner can see it.
  const hidden = await createPerson(
    ctx.db,
    toContactActor(ownerActor),
    { name: "Hidden", emails: [], phones: [], orgId: null, customFields: {} },
    AbortSignal.timeout(10_000),
  );
  if (!hidden.ok) throw new Error(`setup failed: ${hidden.error.message}`);

  const outsider = await seedUser(ctx.db);
  const outsiderActor = makeActor(outsider);
  const outsiderCaller = makeCaller(ctx.db, outsiderActor);

  // unwrap maps the 404-on-invisible Result error to a TRPCError with code NOT_FOUND.
  await expect(outsiderCaller.contacts.getPerson({ id: hidden.value.id })).rejects.toSatisfy(
    (e) => e instanceof TRPCError && e.code === "NOT_FOUND",
  );
});

it("contactFollowers reports self-follow state and an empty result for a hidden contact", async () => {
  const user = await seedUser(ctx.db);
  const actor = makeActor(user);
  const caller = makeCaller(ctx.db, actor);

  const created = await createPerson(
    ctx.db,
    toContactActor(actor),
    { name: "Ada Lovelace", emails: [], phones: [], orgId: null, customFields: {} },
    AbortSignal.timeout(10_000),
  );
  if (!created.ok) throw new Error(`createPerson failed: ${created.error.message}`);

  const before = await caller.contacts.contactFollowers({
    entityType: "person",
    entityId: created.value.id,
  });
  expect(before).toEqual({ followers: [], isFollowedBySelf: false });

  const followed = await followContact(
    ctx.db,
    actor,
    "person",
    created.value.id,
    AbortSignal.timeout(10_000),
  );
  if (!followed.ok) throw new Error(`followContact failed: ${followed.error.message}`);

  const after = await caller.contacts.contactFollowers({
    entityType: "person",
    entityId: created.value.id,
  });
  expect(after.isFollowedBySelf).toBe(true);
  expect(after.followers.map((f) => f.id)).toContain(user.id);

  // Owner-level visibility (settings empty fallback): an outsider cannot see it, so the
  // gated query must not leak follower existence.
  const hidden = await createPerson(
    ctx.db,
    toContactActor(actor),
    { name: "Hidden", emails: [], phones: [], orgId: null, customFields: {} },
    AbortSignal.timeout(10_000),
  );
  if (!hidden.ok) throw new Error(`setup failed: ${hidden.error.message}`);
  await followContact(ctx.db, actor, "person", hidden.value.id, AbortSignal.timeout(10_000));

  const outsider = await seedUser(ctx.db);
  const outsiderCaller = makeCaller(ctx.db, makeActor(outsider));
  const outsiderView = await outsiderCaller.contacts.contactFollowers({
    entityType: "person",
    entityId: hidden.value.id,
  });
  expect(outsiderView).toEqual({ followers: [], isFollowedBySelf: false });
});

it("contactsFeed resolves its zod defaults and hides an activity on an unseen contact", async () => {
  const owner = await seedUser(ctx.db);
  const [type] = await ctx.db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
  if (type === undefined) throw new Error("activity type 'call' not seeded");

  // "all" visibility so the outsider caller below can see it; createPerson's owner-level
  // default would make this test indistinguishable from the "hidden" contact.
  const [visible] = await ctx.db
    .insert(persons)
    .values({ name: "Feed Visible", ownerId: owner.id, visibilityLevel: "all" })
    .returning();
  const [hidden] = await ctx.db
    .insert(persons)
    .values({ name: "Feed Hidden", ownerId: owner.id, visibilityLevel: "owner" })
    .returning();
  if (visible === undefined || hidden === undefined) throw new Error("person seed failed");

  await ctx.db.insert(activities).values({
    typeId: type.id,
    subject: "Feed visible call",
    ownerId: owner.id,
    assigneeId: owner.id,
    personId: visible.id,
    dueAt: new Date("2026-07-01T10:00:00.000Z"),
  });
  await ctx.db.insert(activities).values({
    typeId: type.id,
    subject: "Feed hidden call",
    ownerId: owner.id,
    assigneeId: owner.id,
    personId: hidden.id,
    dueAt: new Date("2026-07-02T10:00:00.000Z"),
  });

  const outsider = await seedUser(ctx.db);
  const outsiderCaller = makeCaller(ctx.db, makeActor(outsider));

  // No explicit limit/before: the zod defaults (limit 50, before null) must still resolve.
  const rows = await outsiderCaller.contacts.contactsFeed({});
  const subjects = rows.map((r) => r.subject);
  expect(subjects).toContain("Feed visible call");
  expect(subjects).not.toContain("Feed hidden call");
});
