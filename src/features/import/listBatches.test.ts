import { expect, it } from "vitest";
import { importBatches } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { hydrateActor } from "@/server/hydrateActor";
import { toImportActor } from "./importActor";
import { listBatches } from "./results";

it("lists only the actor's own batches, newest first", async () => {
  await withTestDb(async (db) => {
    const me = await seedUser(db, {});
    const other = await seedUser(db, {});
    // Explicit createdAt so the newest-first ordering is deterministic (a single multi-row
    // insert would stamp identical timestamps).
    await db.insert(importBatches).values([
      {
        targetEntity: "person",
        filename: "mine1.csv",
        status: "completed",
        createdBy: me.id,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
      {
        targetEntity: "deal",
        filename: "mine2.csv",
        status: "partial",
        createdBy: me.id,
        createdAt: new Date("2026-02-01T00:00:00Z"),
      },
      {
        targetEntity: "person",
        filename: "theirs.csv",
        status: "completed",
        createdBy: other.id,
        createdAt: new Date("2026-03-01T00:00:00Z"),
      },
    ]);
    const actor = toImportActor((await hydrateActor(db, me.id, AbortSignal.timeout(5000)))!);
    const r = await listBatches(db, actor, AbortSignal.timeout(5000));
    expect(r.ok && r.value.map((b) => b.filename)).toEqual(["mine2.csv", "mine1.csv"]);
  });
});

it("lists only undo-able imports (completed/partial), hiding abandoned and failed batches", async () => {
  await withTestDb(async (db) => {
    const me = await seedUser(db, {});
    await db.insert(importBatches).values([
      { targetEntity: "lead", filename: "done.csv", status: "completed", createdBy: me.id },
      { targetEntity: "lead", filename: "part.csv", status: "partial", createdBy: me.id },
      {
        targetEntity: "lead",
        filename: "abandoned.csv",
        status: "mapping_ready",
        createdBy: me.id,
      },
      { targetEntity: "lead", filename: "uploaded.csv", status: "uploaded", createdBy: me.id },
      { targetEntity: "lead", filename: "failed.csv", status: "failed", createdBy: me.id },
    ]);
    const actor = toImportActor((await hydrateActor(db, me.id, AbortSignal.timeout(5000)))!);
    const r = await listBatches(db, actor, AbortSignal.timeout(5000));
    expect(r.ok && [...r.value.map((b) => b.filename)].sort()).toEqual(["done.csv", "part.csv"]);
  });
});
