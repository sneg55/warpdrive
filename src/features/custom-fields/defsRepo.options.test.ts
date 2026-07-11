import { expect, it } from "vitest";
import type { Db } from "@/db/client";
import { withTestDb } from "@/db/testing";
import { createDef } from "./defsRepo";
import { addOption, archiveOption, renameOption } from "./defsRepo.options";

const sig = () => new AbortController().signal;

async function seedOptionDef(db: Db) {
  const created = await createDef(
    db,
    {
      targetEntity: "deal",
      type: "single_option",
      name: "Priority",
      options: [
        { id: "opt-1", label: "Low" },
        { id: "opt-2", label: "High" },
      ],
    },
    sig(),
  );
  if (created.ok === false) throw new Error("setup failed");
  return created.value;
}

it("renames an option label by id, keeping the immutable id so stored values resolve", async () => {
  await withTestDb(async (db) => {
    const def = await seedOptionDef(db);
    const r = await renameOption(db, { id: def.id, optionId: "opt-1", label: "Lowest" }, sig());
    expect(r.ok).toBe(true);
    if (r.ok === true) {
      expect(r.value.options.find((o) => o.id === "opt-1")?.label).toBe("Lowest");
      expect(r.value.options.map((o) => o.id)).toEqual(["opt-1", "opt-2"]);
    }
  });
});

it("archives an option (archived:true) instead of hard-deleting it from the jsonb array", async () => {
  await withTestDb(async (db) => {
    const def = await seedOptionDef(db);
    const r = await archiveOption(db, { id: def.id, optionId: "opt-2" }, sig());
    expect(r.ok).toBe(true);
    if (r.ok === true) {
      // id preserved (old stored values still render), just flagged archived.
      expect(r.value.options.find((o) => o.id === "opt-2")?.archived).toBe(true);
      expect(r.value.options).toHaveLength(2);
    }
  });
});

it("appends a new option with a fresh id and the given label", async () => {
  await withTestDb(async (db) => {
    const def = await seedOptionDef(db);
    const r = await addOption(db, { id: def.id, label: "Medium" }, sig());
    expect(r.ok).toBe(true);
    if (r.ok === true) {
      expect(r.value.options).toHaveLength(3);
      const added = r.value.options[2];
      expect(added?.label).toBe("Medium");
      expect(typeof added?.id).toBe("string");
      expect(added?.id).not.toBe("opt-1");
    }
  });
});

it("returns CF_DEF_NOT_FOUND for a missing def", async () => {
  await withTestDb(async (db) => {
    const r = await addOption(
      db,
      { id: "00000000-0000-0000-0000-000000000000", label: "X" },
      sig(),
    );
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.error.id).toBe("E_CF_002");
  });
});
