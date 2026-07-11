import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import { applyMergeFields } from "./merge";
import { buildMergeContext } from "./mergeContext";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];
const SIG = (): AbortSignal => new AbortController().signal;
const actorOf = (id: string): AuthUser => ({
  id,
  type: "regular",
  isActive: true,
  groupIds: new Set(),
});

async function seedOrg(db: TestDb, ownerId: string, name: string): Promise<string> {
  return (
    (
      await db.execute(sql`
        INSERT INTO organizations (name, owner_id, visibility_level) VALUES (${name}, ${ownerId}, 'all') RETURNING id
      `)
    ).rows[0] as { id: string }
  ).id;
}

async function seedPersonAndDeal(db: TestDb, ownerId: string, orgId: string): Promise<void> {
  const person = (
    await db.execute(sql`
      INSERT INTO persons (name, first_name, last_name, primary_email, org_id, owner_id, visibility_level)
      VALUES ('Sofia Ramirez','Sofia','Ramirez','buyer@corp.com', ${orgId}, ${ownerId}, 'all') RETURNING id
    `)
  ).rows[0] as { id: string };
  const pipeline = (await db.execute(sql`INSERT INTO pipelines (name) VALUES ('P') RETURNING id`))
    .rows[0] as { id: string };
  const stage = (
    await db.execute(
      sql`INSERT INTO stages (name, pipeline_id, "order") VALUES ('S1', ${pipeline.id}, 0) RETURNING id`,
    )
  ).rows[0] as { id: string };
  await db.execute(sql`
    INSERT INTO deals (title, value, pipeline_id, stage_id, owner_id, visibility_level, person_id, org_id, status)
    VALUES ('Acme Expansion', 25000, ${pipeline.id}, ${stage.id}, ${ownerId}, 'all', ${person.id}, ${orgId}, 'open')
  `);
}

describe("buildMergeContext + applyMergeFields", () => {
  it("resolves person/deal/org tokens from the recipient and substitutes them", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "me@acme.com" });
      const orgId = await seedOrg(db, owner.id, "Corp Inc");
      await seedPersonAndDeal(db, owner.id, orgId);

      const ctx = await buildMergeContext(
        db,
        {
          owner: actorOf(owner.id),
          recipientEmail: "buyer@corp.com",
          explicitPersonId: null,
          explicitDealId: null,
        },
        SIG(),
      );

      expect(ctx["person.name"]).toBe("Sofia Ramirez");
      expect(ctx["person.first_name"]).toBe("Sofia");
      expect(ctx["deal.title"]).toBe("Acme Expansion");
      expect(ctx["deal.value"]).toBe("25000");
      expect(ctx["org.name"]).toBe("Corp Inc");

      const subject = applyMergeFields("Proposal for {{person.name}}", ctx);
      const body = applyMergeFields(
        "Hi {{person.first_name}}, re {{deal.title}} at {{org.name}}.",
        ctx,
      );
      expect(subject).toBe("Proposal for Sofia Ramirez");
      expect(body).toBe("Hi Sofia, re Acme Expansion at Corp Inc.");
    });
  });

  it("returns an empty context (tokens render blank) when the recipient matches no visible person", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "me@acme.com" });
      const ctx = await buildMergeContext(
        db,
        {
          owner: actorOf(owner.id),
          recipientEmail: "stranger@nowhere.com",
          explicitPersonId: null,
          explicitDealId: null,
        },
        SIG(),
      );
      expect(ctx).toEqual({});
      expect(applyMergeFields("Hi {{person.first_name}}!", ctx)).toBe("Hi !");
    });
  });
});
