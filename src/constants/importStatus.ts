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

export const IMPORTING_LEASE_MS = 60_000;

const TERMINAL_IMPORT_STATUSES = ["completed", "failed", "partial"] as const;

export const UNDOABLE_IMPORT_STATUSES = ["completed", "partial"] as const;

export function isTerminalImportStatus(status: ImportStatus): boolean {
  return (TERMINAL_IMPORT_STATUSES as readonly string[]).includes(status);
}

export const IMPORT_PROGRESS_MIN_STEP = 100;
