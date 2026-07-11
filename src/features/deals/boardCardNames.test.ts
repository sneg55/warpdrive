import { describe, expect, it } from "vitest";
import { organizations, persons } from "@/db/schema";
import { settings } from "@/db/schema/system";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { createDeal } from "./dealActions";
import { getBoardColumns } from "./dealRepo";

function admin(userId: string) {
  return {
    userId,
    isAdmin: true,
    isActive: true,
    sessionLive: true,
    visibilityGroupIds: [] as string[],
    managedUserIds: [] as string[],
    primaryVisibilityGroupId: null as string | null,
    flags: {} as Record<string, boolean>,
  };
}

describe("board card names", () => {
  // Pipedrive parity: pipeline cards lead with the org/person name and a real owner, not a
  // raw id. getBoardColumns must resolve owner/person/org display names via JOINs.
  it("returns resolved owner, person, and org names on each card", async () => {
    await withTestDb(async (db) => {
      const signal = new AbortController().signal;
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
      });
      const owner = await seedUser(db, { name: "Dana Owner" });

      const [org] = await db
        .insert(organizations)
        .values({ name: "Acme Org", ownerId: owner.id, visibilityLevel: "all" })
        .returning();
      if (!org) throw new Error("org insert failed");

      const [person] = await db
        .insert(persons)
        .values({
          name: "Jane Person",
          primaryEmail: "jane@example.com",
          emails: [{ label: "work", value: "jane@example.com", primary: true }],
          phones: [],
          orgId: org.id,
          ownerId: owner.id,
          visibilityLevel: "all",
        })
        .returning();
      if (!person) throw new Error("person insert failed");

      const pipe = await seedPipelineWithStages(db, ["Lead"]);
      const stage = pipe.stages[0];
      if (!stage) throw new Error("no stage");

      await createDeal(
        db,
        admin(owner.id),
        {
          title: "Acme deal",
          pipelineId: pipe.pipeline.id,
          stageId: stage.id,
          value: 100,
          personId: person.id,
          orgId: org.id,
        },
        signal,
      );

      const { cards } = await getBoardColumns(db, admin(owner.id), pipe.pipeline.id, signal);
      const card = cards.find((c) => c.title === "Acme deal");
      expect(card).toBeDefined();
      expect(card?.ownerName).toBe("Dana Owner");
      expect(card?.personName).toBe("Jane Person");
      expect(card?.orgName).toBe("Acme Org");
    });
  });
});
