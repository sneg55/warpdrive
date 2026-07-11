// Pure step machine for the import wizard. The reducer enforces order (upload ->
// map after a batch is created -> preview after validation) and translates the
// UI's per-column choices into the backend columnMappingSchema shape via
// buildColumnMapping. No React, no I/O: the orchestrator owns the async calls.
import { assertNever } from "@/types/result";
import type { MappableEntity } from "./importFields";
import { primaryEntityOf, STANDARD_IMPORT_FIELDS } from "./importFields";
import type { ColumnMapping } from "./schemas";

export type WizardStep = "upload" | "preparing" | "map" | "validating" | "preview" | "commit";
export type ImportTarget = "person" | "organization" | "deal" | "lead" | "activity";

// One CSV column's destination: an entity, plus exactly one of a standard `field` or a custom
// `key`. Both empty means "do not import this column". The entity is what lets one row write a
// lead AND its organization AND a note (see importFields.TARGET_ENTITY_GROUPS).
export interface ColumnChoice {
  entity: MappableEntity;
  field: string;
  isCustom: boolean;
  key: string;
}

export interface WizardState {
  step: WizardStep;
  target: ImportTarget;
  filename: string;
  headers: string[];
  rows: Record<string, string>[];
  batchId: string | null;
  totalRows: number;
  dedupMode: "skip" | "update";
  columns: Record<string, ColumnChoice>;
  // Collect every unmapped, non-empty cell into a note on the created record.
  rowNoteFromUnmapped: boolean;
  validation: { valid: number; invalid: number } | null;
}

// An unmapped column still carries an entity so the picker has something to render; the empty
// field/key is what marks it "do not import".
function unmapped(target: ImportTarget): ColumnChoice {
  return { entity: primaryEntityOf(target), field: "", isCustom: false, key: "" };
}

export function initialWizardState(): WizardState {
  return {
    step: "upload",
    target: "person",
    filename: "",
    headers: [],
    rows: [],
    batchId: null,
    totalRows: 0,
    dedupMode: "skip",
    columns: {},
    rowNoteFromUnmapped: false,
    validation: null,
  };
}

export type WizardAction =
  | { type: "setTarget"; target: ImportTarget }
  | { type: "loadFile"; filename: string; headers: string[]; rows: Record<string, string>[] }
  | { type: "setColumn"; header: string; choice: ColumnChoice }
  | { type: "setDedup"; dedupMode: "skip" | "update" }
  | { type: "setRowNote"; rowNoteFromUnmapped: boolean }
  | { type: "batchCreated"; batchId: string }
  | { type: "uploaded"; batchId: string }
  | {
      type: "prepared";
      headers: string[];
      totalRows: number;
      previewRows: Record<string, string>[];
    }
  | { type: "validated"; validation: { valid: number; invalid: number } }
  | { type: "goto"; step: WizardStep }
  | { type: "reset" };

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "setTarget":
      // A mapping built for the previous entity's field set is invalid; clear it.
      return { ...state, target: action.target, columns: {} };
    case "loadFile":
      return {
        ...state,
        filename: action.filename,
        headers: action.headers,
        rows: action.rows,
        columns: Object.fromEntries(action.headers.map((h) => [h, unmapped(state.target)])),
        batchId: null,
        validation: null,
      };
    case "setColumn":
      return { ...state, columns: { ...state.columns, [action.header]: action.choice } };
    case "setDedup":
      return { ...state, dedupMode: action.dedupMode };
    case "setRowNote":
      return { ...state, rowNoteFromUnmapped: action.rowNoteFromUnmapped };
    case "batchCreated":
      return { ...state, batchId: action.batchId, step: "map" };
    case "uploaded":
      return { ...state, batchId: action.batchId, step: "preparing" };
    case "prepared":
      // rows holds the batch's stored preview rows: the map step samples them for example values.
      return {
        ...state,
        headers: action.headers,
        totalRows: action.totalRows,
        rows: action.previewRows,
        columns: Object.fromEntries(action.headers.map((h) => [h, unmapped(state.target)])),
        step: "map",
      };
    case "validated":
      return { ...state, validation: action.validation, step: "preview" };
    case "goto":
      return { ...state, step: action.step };
    case "reset":
      return initialWizardState();
    default:
      return assertNever(action);
  }
}

// The standard (non-custom) fields the current mapping targets, keyed "entity:field". The entity
// has to be part of the key: Organization > Name and Person > Name are different destinations, and
// a person import must not count the former as satisfying its required Name.
export function mappedFields(state: WizardState): Set<string> {
  const out = new Set<string>();
  for (const col of Object.values(state.columns)) {
    if (!col.isCustom && col.field !== "") out.add(`${col.entity}:${col.field}`);
  }
  return out;
}

// A mapping is complete once every REQUIRED field of the target's PRIMARY entity has a column
// mapped to it (name for person/org, title for deal/lead, subject for activity); the map step's
// Continue stays disabled until then. A related group's required field (Organization > Name) is
// enforced at validate time, since the group is optional until one of its cells is filled.
export function isMappingComplete(state: WizardState): boolean {
  const mapped = mappedFields(state);
  const primary = primaryEntityOf(state.target);
  return STANDARD_IMPORT_FIELDS[state.target]
    .filter((f) => f.required)
    .every((f) => mapped.has(`${primary}:${f.field}`));
}

// Project the UI choices onto the backend's columnMappingSchema, dropping columns
// the user left unmapped so applyMapping ignores them.
export function buildColumnMapping(state: WizardState): ColumnMapping {
  const columns: ColumnMapping["columns"] = {};
  for (const [header, choice] of Object.entries(state.columns)) {
    if (choice.field === "" && choice.key === "") continue;
    columns[header] = choice;
  }
  return {
    dedupMode: state.dedupMode,
    columns,
    options: { rowNoteFromUnmapped: state.rowNoteFromUnmapped },
  };
}
