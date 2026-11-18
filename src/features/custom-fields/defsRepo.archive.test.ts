import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { customFieldDefs } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { archiveDef, createDef } from "./defsRepo";

const sig = (): AbortSignal => new AbortController().signal;

it("archiving an already-archived field keeps its original archived_at", async () => {
  await withTestDb(async (db) => {
    const created = await createDef(
      db,
      { targetEntity: "deal", type: "text", name: "Budget code" },
      sig(),
    );
    if (!created.ok) throw new Error("setup failed");
    const earlier = new Date("2026-01-02T03:04:05.000Z");
    await db
      .update(customFieldDefs)
      .set({ archivedAt: earlier })
      .where(eq(customFieldDefs.id, created.value.id));

    const again = await archiveDef(db, created.value.id, sig());
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.value.archivedAt?.getTime()).toBe(earlier.getTime());
    const [row] = await db
      .select({ archivedAt: customFieldDefs.archivedAt })
      .from(customFieldDefs)
      .where(eq(customFieldDefs.id, created.value.id));
    expect(row?.archivedAt?.getTime()).toBe(earlier.getTime());
  });
});

it("still reports a missing field as not found", async () => {
  await withTestDb(async (db) => {
    const r = await archiveDef(db, "00000000-0000-4000-8000-000000000000", sig());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.id).toBe(ERROR_IDS.CF_DEF_NOT_FOUND);
  });
});
