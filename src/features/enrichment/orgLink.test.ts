// Uniqueness has to be judged among the organizations the actor can see. Returning a hidden id
// makes updatePerson reject the whole patch through assertReferenceVisible, which loses the
// valid selected fields too; an invisible match must read as no match instead.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { toContactActor } from "@/features/contacts/actorAdapters";
import type { ContactActor } from "@/features/contacts/personsRepo";
import { seedUser, toActor } from "@/features/stats/statsTestHelpers";
import { makeTestDb, type TestDb } from "@/test/db";
import { resolveOrgLink } from "./orgLink";

let h: TestDb;
let admin: typeof schema.users.$inferSelect;
let outsider: ContactActor;
let adminActor: ContactActor;

const SIG = (): AbortSignal => AbortSignal.timeout(20_000);

beforeAll(async () => {
  h = await makeTestDb();
  admin = await seedUser(h, { isAdmin: true });
  const regular = await seedUser(h, { isAdmin: false });
  outsider = toContactActor(toActor(regular));
  adminActor = toContactActor(toActor(admin));
});
afterAll(async () => {
  await h.close();
});

async function seedOrg(values: Partial<typeof schema.organizations.$inferInsert> = {}) {
  const [row] = await h.db
    .insert(schema.organizations)
    .values({
      name: `Acme-${Math.random().toString(36).slice(2)}`,
      ownerId: admin.id,
      visibilityLevel: "all",
      ...values,
    })
    .returning();
  if (row === undefined) throw new Error("no org row");
  return row;
}

describe("resolveOrgLink visibility", () => {
  it("returns null when the only name match is hidden from the actor", async () => {
    const hidden = await seedOrg({ name: "Umbrella Health", visibilityLevel: "owner" });
    const id = await resolveOrgLink(h.db, { name: "Umbrella Health" }, SIG(), outsider);
    expect(id).toBeNull();
    expect(id).not.toBe(hidden.id);
  });

  it("returns null when the only domain match is hidden from the actor", async () => {
    const hidden = await seedOrg({
      name: "Tyrell Corp",
      domain: "tyrell.com",
      visibilityLevel: "owner",
    });
    const id = await resolveOrgLink(
      h.db,
      { name: "Nothing By This Name", domain: "https://www.tyrell.com/" },
      SIG(),
      outsider,
    );
    expect(id).toBeNull();
    expect(id).not.toBe(hidden.id);
  });

  it("links the visible namesake instead of reading a hidden one as ambiguity", async () => {
    await seedOrg({ name: "Wayne Industries", visibilityLevel: "owner" });
    const visible = await seedOrg({ name: "Wayne Industries", visibilityLevel: "all" });
    const id = await resolveOrgLink(h.db, { name: "Wayne Industries" }, SIG(), outsider);
    expect(id).toBe(visible.id);
  });

  it("falls back to the visible name match when the domain match is hidden", async () => {
    await seedOrg({ name: "Stark Holdings", domain: "stark.com", visibilityLevel: "owner" });
    const byName = await seedOrg({ name: "Stark", visibilityLevel: "all" });
    const id = await resolveOrgLink(h.db, { name: "Stark", domain: "stark.com" }, SIG(), outsider);
    expect(id).toBe(byName.id);
  });

  it("still links a record the actor is explicitly allowed to see", async () => {
    const shared = await seedOrg({
      name: "Cyberdyne Systems",
      visibilityLevel: "owner",
      visibleToUserIds: [outsider.id],
    });
    const id = await resolveOrgLink(h.db, { name: "Cyberdyne Systems" }, SIG(), outsider);
    expect(id).toBe(shared.id);
  });

  it("lets an admin link a record no one else can see", async () => {
    const hidden = await seedOrg({ name: "Weyland Yutani", visibilityLevel: "owner" });
    const id = await resolveOrgLink(h.db, { name: "Weyland Yutani" }, SIG(), adminActor);
    expect(id).toBe(hidden.id);
  });
});
