import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { users } from "./identity";
import { organizations, persons } from "./index";

let h: TestDb;
beforeAll(async () => {
  h = await makeTestDb();
});
afterAll(async () => {
  await h.close();
});

it("inserts a person with labeled emails and derives a citext primary_email", async () => {
  // organizations.owner_id is NOT NULL REFERENCES users(id), so seed a real user first.
  const [u] = await h.db
    .insert(users)
    .values({ email: "owner@test.com", name: "Owner", googleSub: "sub-test-1" })
    .returning();

  const [org] = await h.db
    .insert(organizations)
    .values({
      name: "Acme Inc",
      ownerId: u!.id,
      visibilityLevel: "all",
    })
    .returning();

  const [p] = await h.db
    .insert(persons)
    .values({
      name: "Jane Roe",
      primaryEmail: "JANE@ACME.COM",
      emails: [{ label: "work", value: "jane@acme.com", primary: true }],
      phones: [],
      orgId: org!.id,
      ownerId: u!.id,
      visibilityLevel: "all",
    })
    .returning();

  expect(p!.orgId).toBe(org!.id);

  // citext: case-insensitive match must return 1 row even when querying lowercase.
  const found = await h.db.execute(
    sql`select id from persons where primary_email = 'jane@acme.com'`,
  );
  expect((found as unknown as { rows: unknown[] }).rows).toHaveLength(1);
});
