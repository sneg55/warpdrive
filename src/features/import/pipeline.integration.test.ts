import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { importBatches, importRows, leads, organizations, persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { StorageClient } from "@/features/files/storage";
import { hydrateActor } from "@/server/hydrateActor";
import { ok } from "@/types/result";
import { setMapping } from "./batch";
import { handleCommitJob } from "./commitJob";
import { toImportActor } from "./importActor";
import { handlePrepareJob } from "./prepareJob";
import { handleUndoJob } from "./undoJob";
import { confirmImportUpload, requestImportUpload } from "./upload";
import { handleValidateJob } from "./validateJob";

const CSV = "Name\nAlice\nBob";
function storageFor(csv: string): StorageClient {
  return {
    presignPost: () => Promise.resolve(ok({ url: "", fields: {} })),
    headObject: () => Promise.resolve(ok({ size: csv.length, etag: "e", contentType: "text/csv" })),
    presignGet: () => Promise.resolve(ok("")),
    copyObject: () => Promise.resolve(ok(undefined)),
    deleteObject: () => Promise.resolve(ok(undefined)),
    getObjectBytes: () => Promise.resolve(ok(Buffer.from(csv, "utf8"))),
  };
}
function storage(): StorageClient {
  return storageFor(CSV);
}

// A slice of the real BD shortlist (feed-gap-bd-shortlist.csv), same column shape. The lead
// import maps `url` -> Title and `agency_name` -> Organization, so each row must become a lead
// linked to a find-or-created org.
const LEADS_CSV = [
  "agency_name,state,city,reporter_type,total_voms,posture,url",
  "New Jersey Transit Corporation,NJ,Newark,Full Reporter,3431,fails-validation,http://www.njtransit.com/",
  "Chicago Transit Authority,IL,Chicago,Full Reporter,2505,fails-validation,http://www.transitchicago.com/",
  "Southeastern Pennsylvania Transportation Authority,PA,Philadelphia,Full Reporter,1943,fails-validation,http://www.septa.org/",
].join("\n");

it("upload -> prepare -> map -> validate -> commit -> undo", async () => {
  await withTestDb(async (db) => {
    const sig = () => AbortSignal.timeout(5000);
    const user = await seedUser(db, { isAdmin: true });
    const actor = toImportActor((await hydrateActor(db, user.id, sig()))!);

    const req = await requestImportUpload(
      db,
      {
        actorId: user.id,
        storage: storage(),
        input: {
          targetEntity: "person",
          filename: "c.csv",
          contentType: "text/csv",
          size: CSV.length,
        },
      },
      sig(),
    );
    const batchId = req.ok ? req.value.batchId : "";
    await confirmImportUpload(db, { actorId: user.id, storage: storage(), batchId }, sig());
    await handlePrepareJob(db, { storage: storage() }, { data: { batchId } }, sig());
    await setMapping(
      db,
      actor,
      batchId,
      { dedupMode: "skip", columns: { Name: { field: "name", isCustom: false, key: "" } } },
      sig(),
    );
    await handleValidateJob(db, { data: { batchId } }, sig());
    await handleCommitJob(db, { data: { batchId } }, sig());

    expect(await db.select().from(persons).where(eq(persons.name, "Alice"))).toHaveLength(1);
    const [committed] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
    expect(committed?.status).toBe("completed");

    await handleUndoJob(db, { data: { batchId } }, sig());
    const live = await db.select().from(persons).where(eq(persons.name, "Alice"));
    expect(live[0]?.deletedAt).not.toBeNull();
    const rows = await db.select().from(importRows).where(eq(importRows.batchId, batchId));
    expect(rows).toHaveLength(2);
  });
});

it("imports leads from the BD shortlist and links each to a find-or-created org, then undoes both", async () => {
  await withTestDb(async (db) => {
    const sig = () => AbortSignal.timeout(10_000);
    const user = await seedUser(db, { isAdmin: true });
    const actor = toImportActor((await hydrateActor(db, user.id, sig()))!);

    const req = await requestImportUpload(
      db,
      {
        actorId: user.id,
        storage: storageFor(LEADS_CSV),
        input: {
          targetEntity: "lead",
          filename: "feed-gap-bd-shortlist.csv",
          contentType: "text/csv",
          size: LEADS_CSV.length,
        },
      },
      sig(),
    );
    const batchId = req.ok ? req.value.batchId : "";
    await confirmImportUpload(
      db,
      { actorId: user.id, storage: storageFor(LEADS_CSV), batchId },
      sig(),
    );
    await handlePrepareJob(db, { storage: storageFor(LEADS_CSV) }, { data: { batchId } }, sig());
    await setMapping(
      db,
      actor,
      batchId,
      {
        dedupMode: "skip",
        columns: {
          url: { field: "title", isCustom: false, key: "" },
          agency_name: { field: "orgName", isCustom: false, key: "" },
        },
      },
      sig(),
    );
    await handleValidateJob(db, { data: { batchId } }, sig());
    await handleCommitJob(db, { data: { batchId } }, sig());

    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
    expect(batch?.status).toBe("completed");

    // Every row became a lead titled by its url and linked to an organization named by agency_name.
    const allLeads = await db.select().from(leads);
    expect(allLeads).toHaveLength(3);
    for (const lead of allLeads) expect(lead.orgId).not.toBeNull();

    const [njLead] = await db
      .select()
      .from(leads)
      .where(eq(leads.title, "http://www.njtransit.com/"));
    const [njOrg] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.name, "New Jersey Transit Corporation"));
    expect(njLead?.orgId).toBe(njOrg?.id);

    // Three distinct orgs were created (one per unique agency).
    const liveOrgs = (await db.select().from(organizations)).filter((o) => o.deletedAt === null);
    expect(liveOrgs).toHaveLength(3);

    // Undo removes the leads AND the orgs the import created: nothing orphaned.
    await handleUndoJob(db, { data: { batchId } }, sig());
    const orgsAfterUndo = (await db.select().from(organizations)).filter(
      (o) => o.deletedAt === null,
    );
    expect(orgsAfterUndo).toHaveLength(0);
    const leadsAfterUndo = await db.select().from(leads);
    for (const lead of leadsAfterUndo) expect(lead.deletedAt).not.toBeNull();
  });
});
