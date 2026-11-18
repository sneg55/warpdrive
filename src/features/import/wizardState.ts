import { DEFAULT_IMPORT_SOURCE, type ImportSource } from "@/constants/importSources";
import { assertNever } from "@/types/result";
import type { MappableEntity } from "./importFields";
import { primaryEntityOf, requiredFieldsFor, targetsFor } from "./importFields";
import type { ColumnMapping } from "./schemas";
import { reseed, type SuggestContext, seedColumns } from "./wizardSeed";

export type WizardStep = "upload" | "preparing" | "map" | "validating" | "preview" | "commit";
export type ImportTarget = "person" | "organization" | "deal" | "lead" | "activity" | "note";

export interface ColumnChoice {
  entity: MappableEntity;
  field: string;
  isCustom: boolean;
  key: string;
}

export interface WizardState {
  step: WizardStep;
  source: ImportSource;
  createMissingStages: boolean;
  target: ImportTarget;
  filename: string;
  headers: string[];
  rows: Record<string, string>[];
  batchId: string | null;
  totalRows: number;
  dedupMode: "skip" | "update";
  columns: Record<string, ColumnChoice>;
  rowNoteFromUnmapped: boolean;
  validation: { valid: number; invalid: number } | null;
}

export function initialWizardState(): WizardState {
  return {
    step: "upload",
    source: DEFAULT_IMPORT_SOURCE,
    createMissingStages: false,
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
  | { type: "setTarget"; target: ImportTarget; suggest?: SuggestContext }
  | { type: "setSource"; source: ImportSource; suggest?: SuggestContext }
  | { type: "setCreateMissingStages"; createMissingStages: boolean }
  | {
      type: "loadFile";
      filename: string;
      headers: string[];
      rows: Record<string, string>[];
      suggest?: SuggestContext;
    }
  | { type: "setColumn"; header: string; choice: ColumnChoice }
  | { type: "setDedup"; dedupMode: "skip" | "update" }
  | { type: "setRowNote"; rowNoteFromUnmapped: boolean }
  | { type: "batchCreated"; batchId: string }
  | { type: "uploaded"; batchId: string; source: ImportSource; target: ImportTarget }
  | {
      type: "prepared";
      headers: string[];
      totalRows: number;
      previewRows: Record<string, string>[];
      suggest?: SuggestContext;
    }
  | { type: "validated"; validation: { valid: number; invalid: number } }
  | { type: "goto"; step: WizardStep }
  | { type: "reset" };

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "setTarget":
      return {
        ...state,
        target: action.target,
        columns: reseed(state.headers, action.target, state.source, action.suggest),
      };
    case "setSource": {
      const target = targetsFor(action.source).includes(state.target) ? state.target : "person";
      return {
        ...state,
        source: action.source,
        target,
        columns: reseed(state.headers, target, action.source, action.suggest),
      };
    }
    case "setCreateMissingStages":
      return { ...state, createMissingStages: action.createMissingStages };
    case "loadFile":
      return {
        ...state,
        filename: action.filename,
        headers: action.headers,
        rows: action.rows,
        columns: seedColumns(action.headers, state.target, state.source, action.suggest),
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
      return {
        ...state,
        batchId: action.batchId,
        source: action.source,
        target: action.target,
        step: "preparing",
      };
    case "prepared":
      return {
        ...state,
        headers: action.headers,
        totalRows: action.totalRows,
        rows: action.previewRows,
        columns: seedColumns(action.headers, state.target, state.source, action.suggest),
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

function mappedFields(state: WizardState): Set<string> {
  const out = new Set<string>();
  for (const col of Object.values(state.columns)) {
    if (!col.isCustom && col.field !== "") out.add(`${col.entity}:${col.field}`);
  }
  return out;
}

export function isMappingComplete(
  state: WizardState,
  source: ImportSource = DEFAULT_IMPORT_SOURCE,
): boolean {
  const mapped = mappedFields(state);
  const primary = primaryEntityOf(state.target);
  return requiredFieldsFor(state.target, source).every((f) =>
    [f.field, ...(f.satisfiedBy ?? [])].some((field) => mapped.has(`${primary}:${field}`)),
  );
}

export function buildColumnMapping(state: WizardState): ColumnMapping {
  const columns: ColumnMapping["columns"] = {};
  for (const [header, choice] of Object.entries(state.columns)) {
    if (choice.field === "" && choice.key === "") continue;
    columns[header] = choice;
  }
  return {
    dedupMode: state.dedupMode,
    columns,
    options: {
      rowNoteFromUnmapped: state.rowNoteFromUnmapped,
      createMissingStages:
        state.source === "pipedrive" && state.target === "deal" && state.createMissingStages,
    },
  };
}
