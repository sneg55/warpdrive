// Batch lifecycle (data-model section 17), extended by the import overhaul with the
// storage-backed flow (uploaded, parsing, mapping_ready) and undo (undoing, undone).
export const IMPORT_STATUS = [
  "pending",
  "validating",
  "ready",
  "importing",
  "completed",
  "failed",
  "partial",
  "uploaded",
  "parsing",
  "mapping_ready",
  "undoing",
  "undone",
] as const;
export type ImportStatus = (typeof IMPORT_STATUS)[number];

export const IMPORT_ROW_STATUS = [
  "pending",
  "valid",
  "invalid",
  "importing",
  "imported",
  "skipped_duplicate",
  "failed",
] as const;
export type ImportRowStatus = (typeof IMPORT_ROW_STATUS)[number];

export const DEDUP_MODES = ["skip", "update"] as const;
export type DedupMode = (typeof DEDUP_MODES)[number];

// How long an "importing" row lease is held before it can be reclaimed.
export const IMPORTING_LEASE_MS = 60_000;

// Batch statuses at which the commit is done and polling can stop.
export const TERMINAL_IMPORT_STATUSES = ["completed", "failed", "partial"] as const;

// Batch statuses that represent a real, undo-able import. The history list shows only these, so
// abandoned wizard sessions (uploaded, mapping_ready) and failed runs are hidden.
export const UNDOABLE_IMPORT_STATUSES = ["completed", "partial"] as const;

export function isTerminalImportStatus(status: ImportStatus): boolean {
  return (TERMINAL_IMPORT_STATUSES as readonly string[]).includes(status);
}

// Throttle floor: a background job emits at most one progress event per
// max(total/50, this) rows, plus a mandatory final event at each phase end.
export const IMPORT_PROGRESS_MIN_STEP = 100;
