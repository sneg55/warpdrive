// filterAst orgName test: split out of filterAst.test.ts to keep that file under the size cap.
// Verifies the deal filter can match on the linked organization's name (o.name), which the board
// and list reads join. This is what lets a board filter find "Apex Labs" deals by organization.
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { organizations } from "@/db/schema";
import { settings } from "@/db/schema/system";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { createDeal } from "@/features/deals/dealActions";
import { dealVisibilityClause } from "@/features/deals/visibility";
import { filterToSql } from "./filterAst";
import { createSession, visSession } from "./filterAst.test-helpers";

describe("filterToSql: orgName", () => {
  it("filters deals by organization name (contains, case-insensitive)", async () => {
    await withTestDb(async (db) => {
      await db.insert(settings).values({
        id: true,
        baseCurrency: "USD",
        defaultVisibilityLevels: { deal: "all", person: "all", organization: "all" },
      });
      const u = await seedUser(db);
      const p = await seedPipelineWithStages(db, ["A"]);
      const [org] = await db
        .insert(organizations)
        .values({ name: "Apex Labs", ownerId: u.id, visibilityLevel: "all" })
        .returning();
      const apex = await createDeal(
        db,
        createSession(u.id),
        { title: "apex-deal", pipelineId: p.pipeline.id, stageId: p.stages[0]!.id, orgId: org!.id },
        new AbortController().signal,
      );
      const other = await createDeal(
        db,
        createSession(u.id),
        { title: "other-deal", pipelineId: p.pipeline.id, stageId: p.stages[0]!.id },
        new AbortController().signal,
      );
      if (apex.ok === false || other.ok === false) throw new Error("setup");

      const frag = filterToSql({
        conditions: [{ field: "orgName", op: "contains", value: "apex" }],
      });
      const res = await db.execute(sql`
        SELECT d.title FROM deals d
        JOIN pipelines p ON p.id = d.pipeline_id
        LEFT JOIN organizations o ON o.id = d.org_id
        WHERE ${dealVisibilityClause(visSession(u.id))} AND ${frag}
      `);
      const titles = (res as unknown as { rows: Array<{ title: string }> }).rows.map(
        (r) => r.title,
      );
      expect(titles).toEqual(["apex-deal"]);
    });
  });
});
