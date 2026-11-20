import { expect, it } from "vitest";
import { leads } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { OWNERS_RUN_TIMEOUT_MS, run } from "./ownersTestHelpers";
import { adminActorFor } from "./pipedriveImport.testHelpers";

const importedAtMs = Date.now();

it("commits a row when the file has been imported longer than the per-run deadline", async () => {
  await withTestDb(async (db) => {
    const waitedMs = Date.now() - importedAtMs;
    const waitMs = OWNERS_RUN_TIMEOUT_MS + 500 - waitedMs;
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    const importer = await seedUser(db, { isAdmin: true });
    const ann = await seedUser(db, { name: "Ann" });
    const { outcome } = await run(db, adminActorFor(importer.id), "lead", {
      primary: {
        title: "Lead",
        pipedriveId: "L1",
        value: null,
        expectedCloseDate: null,
        customFields: {},
        owner: "Ann",
      },
    });
    expect(outcome.ok && outcome.value.status).toBe("imported");
    const [lead] = await db.select().from(leads);
    expect(lead?.ownerId).toBe(ann.id);
  });
});
