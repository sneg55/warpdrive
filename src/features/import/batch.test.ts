import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { type PermissionFlagKey, REGULAR_DEFAULT_FLAGS } from "@/constants/permissionFlags";
import { importBatches, importRows, persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { commitBatch, createBatch, setMapping, validateBatch } from "./batch";
import type { ImportActor } from "./commit";
import type { ColumnMappingInput } from "./schemas";

// Admin import actor: admin bypasses can() flag checks, keeping the lifecycle test
// focused on orchestration rather than permission-flag plumbing. Mirrors the
// adminActorFor helper in commit.test.ts.
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

// Regular import actor carrying the regular default true-flags. Used for the
// ownership-404 boundary: a non-owner regular actor must NOT see another user's batch.
function regularActorFor(id: string): ImportActor {
  const flags = new Set<PermissionFlagKey>(
    (Object.entries(REGULAR_DEFAULT_FLAGS) as [PermissionFlagKey, boolean][])
      .filter(([, on]) => on === true)
      .map(([key]) => key),
  );
  return {
    id,
    type: "regular",
    isActive: true,
    groupIds: new Set<string>(),
    primaryVisibilityGroupId: null,
    flags,
  };
}

// Map the CSV headers "Name" and "Email" to the person name + emails fields.
function personMapping(dedupMode: "skip" | "update"): ColumnMappingInput {
  return {
    dedupMode,
    columns: {
      Name: { field: "name", isCustom: false, key: "" },
      Email: { field: "emails", isCustom: false, key: "" },
    },
  };
}

it("runs the full create-batch -> validate -> commit lifecycle", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);

    // 1. Create a batch with one valid row (name + email) and one invalid (no name).
    const created = await createBatch(
      db,
      actor,
      {
        targetEntity: "person",
        filename: "people.csv",
        rows: [
          { Name: "Valid Vera", Email: "vera@a.com" },
          { Name: "", Email: "noname@a.com" },
        ],
      },
      signal,
    );
    expect(created.ok).toBe(true);
    if (created.ok === false) throw new Error(`createBatch failed: ${created.error.id}`);
    const { batchId } = created.value;

    // 2. Persist the column mapping (dedupMode skip).
    const mapped = await setMapping(db, actor, batchId, personMapping("skip"), signal);
    expect(mapped.ok).toBe(true);

    // 3. Validate every row: one valid, one invalid (missing required name).
    const validated = await validateBatch(db, actor, batchId, signal);
    expect(validated.ok).toBe(true);
    if (validated.ok === true) {
      expect(validated.value).toEqual({ valid: 1, invalid: 1 });
    }

    const [batchAfterValidate] = await db
      .select()
      .from(importBatches)
      .where(eq(importBatches.id, batchId));
    expect(batchAfterValidate?.status).toBe("ready");

    const rowsAfterValidate = await db
      .select()
      .from(importRows)
      .where(eq(importRows.batchId, batchId));
    const statuses = rowsAfterValidate.map((r) => r.status).sort();
    expect(statuses).toEqual(["invalid", "valid"]);

    // 4. Commit: only the valid row commits, creating a real person. The invalid
    // row is not "valid" so it is left alone; the batch lands "partial".
    const committed = await commitBatch(db, actor, batchId, signal);
    expect(committed.ok).toBe(true);
    if (committed.ok === true) {
      expect(committed.value).toEqual({ imported: 1, skipped: 0, invalid: 0 });
    }

    const created1 = await db.select().from(persons).where(eq(persons.primaryEmail, "vera@a.com"));
    expect(created1).toHaveLength(1);

    const [batchAfterCommit] = await db
      .select()
      .from(importBatches)
      .where(eq(importBatches.id, batchId));
    expect(batchAfterCommit?.status).toBe("partial");

    // 5. Idempotency: re-running commitBatch does not double-create.
    const recommit = await commitBatch(db, actor, batchId, signal);
    expect(recommit.ok).toBe(true);
    if (recommit.ok === true) {
      expect(recommit.value.imported).toBe(0);
    }
    const stillOne = await db.select().from(persons).where(eq(persons.primaryEmail, "vera@a.com"));
    expect(stillOne).toHaveLength(1);
  });
});

it("commits a duplicate row as skipped_duplicate in skip mode", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);

    // Pre-existing person with the same primaryEmail the CSV row carries.
    await db.insert(persons).values({
      name: "Existing Dupe",
      primaryEmail: "dupe@a.com",
      ownerId: user.id,
      visibilityLevel: "all",
    });

    const created = await createBatch(
      db,
      actor,
      {
        targetEntity: "person",
        filename: "dupe.csv",
        rows: [{ Name: "Incoming Dupe", Email: "dupe@a.com" }],
      },
      signal,
    );
    if (created.ok === false) throw new Error(`createBatch failed: ${created.error.id}`);
    const { batchId } = created.value;

    await setMapping(db, actor, batchId, personMapping("skip"), signal);
    await validateBatch(db, actor, batchId, signal);

    const committed = await commitBatch(db, actor, batchId, signal);
    expect(committed.ok).toBe(true);
    if (committed.ok === true) {
      expect(committed.value).toEqual({ imported: 0, skipped: 1, invalid: 0 });
    }

    // No second person created for the duplicate email.
    const matches = await db.select().from(persons).where(eq(persons.primaryEmail, "dupe@a.com"));
    expect(matches).toHaveLength(1);
  });
});

it("hides another user's batch from a non-owner regular actor (ownership 404)", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const owner = await seedUser(db);
    const ownerActor = adminActorFor(owner.id);

    const created = await createBatch(
      db,
      ownerActor,
      { targetEntity: "person", filename: "owned.csv", rows: [{ Name: "A", Email: "a@a.com" }] },
      signal,
    );
    if (created.ok === false) throw new Error(`createBatch failed: ${created.error.id}`);
    const { batchId } = created.value;

    // A different regular user (not the creator, not admin) must get 404-on-invisible.
    const other = await seedUser(db);
    const otherActor = regularActorFor(other.id);
    const r = await setMapping(db, otherActor, batchId, personMapping("skip"), signal);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.error.id).toBe("E_IMPORT_002");
  });
});

it("returns IMPORT_MAPPING_MISSING when validating before a mapping is set", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);

    const created = await createBatch(
      db,
      actor,
      { targetEntity: "person", filename: "nomap.csv", rows: [{ Name: "A", Email: "a@a.com" }] },
      signal,
    );
    if (created.ok === false) throw new Error(`createBatch failed: ${created.error.id}`);

    // No setMapping call: columnMapping is still the {} default. Must be a clean
    // Result error, not an uncaught ZodError from parse({}).
    const r = await validateBatch(db, actor, created.value.batchId, signal);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.error.id).toBe("E_IMPORT_003");
  });
});

// The mapping arrives from the client. A tampered one could aim a column at an entity the target
// never links to, and commit would then create an orphan contact nothing references.
it("rejects a mapping whose column targets an entity the import cannot write", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);
    const created = await createBatch(
      db,
      actor,
      { targetEntity: "lead", filename: "l.csv", rows: [{ Title: "A lead" }] },
      signal,
    );
    if (created.ok === false) throw new Error("createBatch failed");

    const r = await setMapping(
      db,
      actor,
      created.value.batchId,
      {
        dedupMode: "skip",
        columns: { Title: { entity: "person", field: "name", isCustom: false, key: "" } },
      },
      signal,
    );
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.error.id).toBe(ERROR_IDS.IMPORT_MAPPING_ENTITY_INVALID);
  });
});

// End to end through JSONB: prepare stores raw as a JSONB object whose key order Postgres does not
// preserve, so a row note built from Object.keys(raw) could reorder its lines. The batch's stored
// headers must fix the order. This exercises the real round-trip, not an in-memory object.
it("orders a row note by the batch headers after the JSONB round-trip", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db, { isAdmin: true });
    const actor = adminActorFor(user.id);

    // Keys inserted in reverse of the CSV header order, so JSONB storage cannot accidentally
    // reproduce header order for us.
    const headers = ["title", "alpha", "mike", "zulu"];
    const [batch] = await db
      .insert(importBatches)
      .values({
        targetEntity: "lead",
        filename: "l.csv",
        status: "mapping_ready",
        headers,
        createdBy: user.id,
      })
      .returning();
    await db.insert(importRows).values({
      batchId: batch!.id,
      rowNumber: 1,
      raw: { zulu: "z", mike: "m", alpha: "a", title: "A lead" },
      status: "pending",
    });

    await setMapping(
      db,
      actor,
      batch!.id,
      {
        dedupMode: "skip",
        columns: { title: { entity: "lead", field: "title", isCustom: false, key: "" } },
        options: { rowNoteFromUnmapped: true },
      },
      signal,
    );
    const validated = await validateBatch(db, actor, batch!.id, signal);
    expect(validated.ok).toBe(true);

    const [row] = await db.select().from(importRows).where(eq(importRows.batchId, batch!.id));
    expect(row?.mapped?.note?.body).toBe("alpha: a\nmike: m\nzulu: z");
  });
});
