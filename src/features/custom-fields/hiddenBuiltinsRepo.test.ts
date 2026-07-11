import { expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { listHiddenBuiltins, setBuiltinFieldHidden } from "./hiddenBuiltinsRepo";

const SIG = (): AbortSignal => AbortSignal.timeout(5000);

it("hides then unhides a built-in field, idempotently", async () => {
  await withTestDb(async (db) => {
    let map = await listHiddenBuiltins(db, SIG());
    expect(map.organization.has("industry")).toBe(false);

    const r1 = await setBuiltinFieldHidden(
      db,
      { entity: "organization", key: "industry", hidden: true },
      SIG(),
    );
    expect(r1.ok).toBe(true);
    map = await listHiddenBuiltins(db, SIG());
    expect(map.organization.has("industry")).toBe(true);

    // Idempotent hide (onConflictDoNothing).
    const r2 = await setBuiltinFieldHidden(
      db,
      { entity: "organization", key: "industry", hidden: true },
      SIG(),
    );
    expect(r2.ok).toBe(true);

    const r3 = await setBuiltinFieldHidden(
      db,
      { entity: "organization", key: "industry", hidden: false },
      SIG(),
    );
    expect(r3.ok).toBe(true);
    map = await listHiddenBuiltins(db, SIG());
    expect(map.organization.has("industry")).toBe(false);
  });
});

it("buckets hidden fields by entity", async () => {
  await withTestDb(async (db) => {
    await setBuiltinFieldHidden(
      db,
      { entity: "organization", key: "industry", hidden: true },
      SIG(),
    );
    await setBuiltinFieldHidden(db, { entity: "deal", key: "value", hidden: true }, SIG());
    const map = await listHiddenBuiltins(db, SIG());
    expect(map.organization.has("industry")).toBe(true);
    expect(map.deal.has("value")).toBe(true);
    expect(map.organization.has("value")).toBe(false);
    expect(map.person.size).toBe(0);
  });
});

it("rejects hiding a locked identity field", async () => {
  await withTestDb(async (db) => {
    const r = await setBuiltinFieldHidden(
      db,
      { entity: "organization", key: "name", hidden: true },
      SIG(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.id).toBe("E_CF_005");
  });
});

it("rejects hiding an unknown field key", async () => {
  await withTestDb(async (db) => {
    const r = await setBuiltinFieldHidden(
      db,
      { entity: "organization", key: "nope", hidden: true },
      SIG(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.id).toBe("E_CF_006");
  });
});
