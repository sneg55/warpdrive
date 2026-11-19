import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { toContactActor } from "@/features/contacts/actorAdapters";
import {
  addParticipantRow,
  captureDealSearchQueue,
  linkedDeal,
} from "@/features/intercom/dealSearch/dealSearch.test-helpers";
import { seedWorld } from "@/features/search/search.test-helpers";
import { seedUser, toActor } from "@/features/stats/statsTestHelpers";
import { makeTestDb, type TestDb } from "@/test/db";
import { applyEnrichment } from "./applyService";
import { mappingsFingerprint } from "./mappingsFingerprint";
import { listMappings } from "./mappingsRepo";

let h: TestDb;
let admin: typeof schema.users.$inferSelect;
const SIG = (): AbortSignal => AbortSignal.timeout(20_000);
let release: () => void = () => undefined;

beforeAll(async () => {
  h = await makeTestDb();
  admin = await seedUser(h, { isAdmin: true });
});
afterAll(async () => {
  await h.close();
});
afterEach(() => release());

describe("enrichment writes to person emails", () => {
  it("queues every deal of the person whose email was applied", async () => {
    const w = await seedWorld(h.db);
    const a = await linkedDeal(h.db, w, "old@vandelay.test");
    const b = await linkedDeal(h.db, w, "b@vandelay.test");
    await addParticipantRow(h.db, b.dealId, a.personId);
    const [run] = await h.db
      .insert(schema.enrichmentRuns)
      .values({
        entityType: "person",
        entityId: a.personId,
        requestedBy: admin.id,
        outcomes: [
          {
            provider: "apollo",
            kind: "ok",
            candidate: { fields: { "person.email": "new@vandelay.test" } },
          },
        ],
      })
      .returning();
    const [person] = await h.db
      .select()
      .from(schema.persons)
      .where(eq(schema.persons.id, a.personId));
    const q = captureDealSearchQueue();
    release = q.release;
    const result = await applyEnrichment(
      h.db,
      toContactActor(toActor(admin)),
      {
        runId: run?.id ?? "",
        expectedUpdatedAtIso: person?.updatedAt.toISOString() ?? "",
        selections: [{ canonicalKey: "person.email", value: "new@vandelay.test" }],
        mappingsFingerprint: mappingsFingerprint(await listMappings(h.db, "person", SIG())),
      },
      new Date(),
      SIG(),
    );
    expect(result.ok).toBe(true);
    expect(q.queued().sort()).toEqual([a.dealId, b.dealId].sort());
  });
});
