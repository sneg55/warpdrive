import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { activities, deals, leads, persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { commitBatch, createBatch, setMapping, validateBatch } from "./batch";
import type { ImportActor } from "./commit";
import { parseCsv } from "./csvParse";
import { primaryEntityOf } from "./importFields";
import {
  buildColumnMapping,
  type ImportTarget,
  initialWizardState,
  wizardReducer,
} from "./wizardState";

function adminActorFor(id: string): ImportActor {
  return {
    id,
    type: "admin",
    isActive: true,
    groupIds: new Set<string>(),
    primaryVisibilityGroupId: null,
    flags: new Set(),
  };
}

// Shared drive-the-wizard-then-run-the-pipeline helper for the entity-broadening tests below:
// set the target, map every header 1:1 to the given standard field, then run create -> map ->
// validate -> commit exactly as the orchestrator does.
async function runPipeline(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  actor: ImportActor,
  target: ImportTarget,
  csv: string,
  headerToField: Record<string, string>,
) {
  const { headers, rows } = parseCsv(csv);
  let state = wizardReducer(initialWizardState(), { type: "setTarget", target });
  state = wizardReducer(state, { type: "loadFile", filename: "x.csv", headers, rows });
  for (const [header, field] of Object.entries(headerToField)) {
    state = wizardReducer(state, {
      type: "setColumn",
      header,
      choice: { entity: primaryEntityOf(target), field, isCustom: false, key: "" },
    });
  }

  const created = await createBatch(
    db,
    actor,
    { targetEntity: target, filename: state.filename, rows: state.rows },
    new AbortController().signal,
  );
  if (created.ok === false) throw new Error(`createBatch failed: ${created.error.id}`);
  const { batchId } = created.value;

  const mapped = await setMapping(
    db,
    actor,
    batchId,
    buildColumnMapping(state),
    new AbortController().signal,
  );
  if (mapped.ok === false) throw new Error(`setMapping failed: ${mapped.error.id}`);

  const validated = await validateBatch(db, actor, batchId, new AbortController().signal);
  if (validated.ok === false) throw new Error(`validateBatch failed: ${validated.error.id}`);

  const committed = await commitBatch(db, actor, batchId, new AbortController().signal);
  if (committed.ok === false) throw new Error(`commitBatch failed: ${committed.error.id}`);

  return { validated: validated.value, committed: committed.value };
}

it("drives create -> map -> validate -> commit from a parsed CSV + built mapping", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);

    // 1. What the browser does: parse the uploaded file text.
    const { headers, rows } = parseCsv(
      "Full Name,Work Email\nJane Doe,jane@a.com\nBob Roe,bob@b.com\n",
    );

    // 2. Reducer state the map step would produce (name + emails mapped).
    let state = wizardReducer(initialWizardState(), {
      type: "loadFile",
      filename: "contacts.csv",
      headers,
      rows,
    });
    state = wizardReducer(state, {
      type: "setColumn",
      header: "Full Name",
      choice: { entity: "person", field: "name", isCustom: false, key: "" },
    });
    state = wizardReducer(state, {
      type: "setColumn",
      header: "Work Email",
      choice: { entity: "person", field: "emails", isCustom: false, key: "" },
    });

    // 3. Run the real pipeline the orchestrator calls in sequence.
    const created = await createBatch(
      db,
      actor,
      { targetEntity: "person", filename: state.filename, rows: state.rows },
      signal,
    );
    if (created.ok === false) throw new Error(`createBatch failed: ${created.error.id}`);
    const batchId = created.value.batchId;

    const mapped = await setMapping(db, actor, batchId, buildColumnMapping(state), signal);
    if (mapped.ok === false) throw new Error(`setMapping failed: ${mapped.error.id}`);

    const validated = await validateBatch(db, actor, batchId, signal);
    if (validated.ok === false) throw new Error(`validateBatch failed: ${validated.error.id}`);
    expect(validated.value).toEqual({ valid: 2, invalid: 0 });

    const committed = await commitBatch(db, actor, batchId, signal);
    if (committed.ok === false) throw new Error(`commitBatch failed: ${committed.error.id}`);
    expect(committed.value.imported).toBe(2);

    const created2 = await db.select().from(persons).where(eq(persons.ownerId, user.id));
    expect(created2.map((p) => p.name).sort()).toEqual(["Bob Roe", "Jane Doe"]);
  });
});

it("imports deals from a CSV, reporting the title-less row invalid instead of dropping it", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);
    const p = await seedPipelineWithStages(db, ["Qualified"]);

    const { validated, committed } = await runPipeline(
      db,
      actor,
      "deal",
      `Title,Value,Pipeline\nAcme Co,1500,${p.pipeline.name}\n,900,${p.pipeline.name}\n`,
      { Title: "title", Value: "value", Pipeline: "pipeline" },
    );

    expect(validated).toEqual({ valid: 1, invalid: 1 });
    expect(committed).toEqual({ imported: 1, skipped: 0, invalid: 0 });

    const created = await db.select().from(deals).where(eq(deals.title, "Acme Co"));
    expect(created).toHaveLength(1);
    expect(created[0]?.pipelineId).toBe(p.pipeline.id);
  });
});

it("imports leads from a CSV, reporting the title-less row invalid instead of dropping it", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);

    const { validated, committed } = await runPipeline(
      db,
      actor,
      "lead",
      "Title,Value\nA promising lead,500\n,900\n",
      { Title: "title", Value: "value" },
    );

    expect(validated).toEqual({ valid: 1, invalid: 1 });
    expect(committed).toEqual({ imported: 1, skipped: 0, invalid: 0 });

    const created = await db.select().from(leads).where(eq(leads.title, "A promising lead"));
    expect(created).toHaveLength(1);
  });
});

it("imports activities from a CSV, reporting the subject-less row invalid instead of dropping it", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);

    const { validated, committed } = await runPipeline(
      db,
      actor,
      "activity",
      "Subject,Type,Due\nFollow up,call,2026-08-01\n,call,2026-08-01\n",
      { Subject: "subject", Type: "typeKey", Due: "dueAt" },
    );

    expect(validated).toEqual({ valid: 1, invalid: 1 });
    expect(committed).toEqual({ imported: 1, skipped: 0, invalid: 0 });

    const created = await db.select().from(activities).where(eq(activities.subject, "Follow up"));
    expect(created).toHaveLength(1);
  });
});
