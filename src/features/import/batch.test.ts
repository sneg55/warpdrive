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

    const mapped = await setMapping(db, actor, batchId, personMapping("skip"), signal);
    expect(mapped.ok).toBe(true);

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

    const r = await validateBatch(db, actor, created.value.batchId, signal);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.error.id).toBe("E_IMPORT_003");
  });
});

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
        columns: { Title: { entity: "deal", field: "title", isCustom: false, key: "" } },
      },
      signal,
    );
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.error.id).toBe(ERROR_IDS.IMPORT_MAPPING_ENTITY_INVALID);
  });
});

it("orders a row note by the batch headers after the JSONB round-trip", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db, { isAdmin: true });
    const actor = adminActorFor(user.id);

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
