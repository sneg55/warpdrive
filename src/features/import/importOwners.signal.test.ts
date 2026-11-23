import { expect, it } from "vitest";
import { leads } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { run } from "./ownersTestHelpers";
import { adminActorFor } from "./pipedriveImport.testHelpers";

const leadRow = (pipedriveId: string) => ({
  primary: {
    title: "Lead",
    pipedriveId,
    value: null,
    expectedCloseDate: null,
    customFields: {},
    owner: "Ann",
  },
});

it("every run commits with its own fresh deadline signal, not one shared across runs", async () => {
  await withTestDb(async (db) => {
    const importer = await seedUser(db, { isAdmin: true });
    const ann = await seedUser(db, { name: "Ann" });
    const actor = adminActorFor(importer.id);
    const timeoutSignals: AbortController[] = [];
    const timeoutSignal = () => {
      const controller = new AbortController();
      timeoutSignals.push(controller);
      return controller.signal;
    };
    const first = await run(db, actor, "lead", leadRow("L1"), { timeoutSignal });
    expect(first.outcome.ok && first.outcome.value.status).toBe("imported");
    timeoutSignals[0]?.abort();
    const second = await run(db, actor, "lead", leadRow("L2"), { timeoutSignal });
    expect(second.outcome.ok && second.outcome.value.status).toBe("imported");
    expect(timeoutSignals.length).toBe(2);
    const stored = await db.select().from(leads);
    expect(stored.map((lead) => lead.ownerId)).toEqual([ann.id, ann.id]);
  });
});
