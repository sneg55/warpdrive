import { expect, it } from "vitest";
import {
  buildColumnMapping,
  initialWizardState,
  isMappingComplete,
  type WizardState,
  wizardReducer,
} from "./wizardState";

const loaded = (): WizardState =>
  wizardReducer(initialWizardState(), {
    type: "loadFile",
    filename: "contacts.csv",
    headers: ["Full Name", "Email"],
    rows: [{ "Full Name": "Jane", Email: "jane@a.com" }],
  });

it("starts on the upload step targeting person", () => {
  const s = initialWizardState();
  expect(s.step).toBe("upload");
  expect(s.target).toBe("person");
});

it("loadFile stores headers/rows and seeds every column unmapped", () => {
  const s = loaded();
  expect(s.headers).toEqual(["Full Name", "Email"]);
  expect(s.columns["Full Name"]).toEqual({
    entity: "person",
    field: "",
    isCustom: false,
    key: "",
  });
  expect(s.batchId).toBeNull();
});

it("changing target clears an in-progress mapping", () => {
  let s = loaded();
  s = wizardReducer(s, {
    type: "setColumn",
    header: "Full Name",
    choice: { entity: "person", field: "name", isCustom: false, key: "" },
  });
  s = wizardReducer(s, { type: "setTarget", target: "organization" });
  expect(s.target).toBe("organization");
  expect(s.columns).toEqual({});
});

it("advances only through the enforced order (upload -> map -> preview)", () => {
  let s = loaded();
  expect(s.step).toBe("upload");
  s = wizardReducer(s, { type: "batchCreated", batchId: "b1" });
  expect(s.step).toBe("map");
  expect(s.batchId).toBe("b1");
  s = wizardReducer(s, { type: "validated", validation: { valid: 1, invalid: 0 } });
  expect(s.step).toBe("preview");
  expect(s.validation).toEqual({ valid: 1, invalid: 0 });
});

it("isMappingComplete requires a column mapped to the required name field", () => {
  let s = loaded();
  expect(isMappingComplete(s)).toBe(false);
  s = wizardReducer(s, {
    type: "setColumn",
    header: "Full Name",
    choice: { entity: "person", field: "name", isCustom: false, key: "" },
  });
  expect(isMappingComplete(s)).toBe(true);
});

// Regression: isMappingComplete must generalize per-target (title for deal/lead, subject for
// activity), not hardcode "name" (which does not even appear in STANDARD_IMPORT_FIELDS.deal).
it("isMappingComplete requires the target's own required field, not a hardcoded 'name'", () => {
  let s = wizardReducer(initialWizardState(), { type: "setTarget", target: "deal" });
  s = wizardReducer(s, {
    type: "loadFile",
    filename: "deals.csv",
    headers: ["Deal Title"],
    rows: [{ "Deal Title": "Acme" }],
  });
  expect(isMappingComplete(s)).toBe(false);
  s = wizardReducer(s, {
    type: "setColumn",
    header: "Deal Title",
    choice: { entity: "deal", field: "title", isCustom: false, key: "" },
  });
  expect(isMappingComplete(s)).toBe(true);
});

it("buildColumnMapping emits the columnMappingSchema shape, dropping unmapped headers", () => {
  let s = loaded();
  s = wizardReducer(s, {
    type: "setColumn",
    header: "Full Name",
    choice: { entity: "person", field: "name", isCustom: false, key: "" },
  });
  s = wizardReducer(s, {
    type: "setColumn",
    header: "Email",
    choice: { entity: "person", field: "emails", isCustom: false, key: "" },
  });
  s = wizardReducer(s, { type: "setDedup", dedupMode: "update" });
  expect(buildColumnMapping(s)).toEqual({
    dedupMode: "update",
    options: { rowNoteFromUnmapped: false },
    columns: {
      "Full Name": { entity: "person", field: "name", isCustom: false, key: "" },
      Email: { entity: "person", field: "emails", isCustom: false, key: "" },
    },
  });
});

it("buildColumnMapping keeps custom-field columns and omits fully-unmapped ones", () => {
  let s = loaded();
  s = wizardReducer(s, {
    type: "setColumn",
    header: "Full Name",
    choice: { entity: "person", field: "", isCustom: true, key: "linkedin" },
  });
  expect(buildColumnMapping(s).columns).toEqual({
    "Full Name": { entity: "person", field: "", isCustom: true, key: "linkedin" },
  });
});

it("reset returns to the initial state", () => {
  const s = wizardReducer(loaded(), { type: "reset" });
  expect(s).toEqual(initialWizardState());
});

// The prepare job stores the file's first rows on the batch. Carry them into wizard state so the
// map step can show example values under each column, the way Pipedrive does.
it("prepared keeps the preview rows so the map step can sample them", () => {
  const s = wizardReducer(initialWizardState(), {
    type: "prepared",
    headers: ["agency_name", "state"],
    totalRows: 115,
    previewRows: [
      { agency_name: "New Jersey Transit Corporation", state: "NJ" },
      { agency_name: "Chicago Transit Authority", state: "IL" },
    ],
  });
  expect(s.step).toBe("map");
  expect(s.headers).toEqual(["agency_name", "state"]);
  expect(s.rows).toEqual([
    { agency_name: "New Jersey Transit Corporation", state: "NJ" },
    { agency_name: "Chicago Transit Authority", state: "IL" },
  ]);
});
