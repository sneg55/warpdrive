// Shared Tailwind class for full-width text/select form inputs used across the create/edit modals.
// One source of truth so the field styling stays in step (was copy-pasted into four components).
export const FIELD_INPUT = "w-full rounded-md border px-2.5 py-1.5 text-sm";

// Compact inline <select> used in toolbars (pipeline switcher, board sort field).
export const SELECT_INPUT = "rounded-md border bg-card px-2 py-1 text-sm text-foreground";

// A single bordered icon button (edit-pipeline pencil, board sort-direction toggle). Pairs a
// muted resting color with a foreground hover.
export const ICON_BUTTON =
  "flex items-center justify-center rounded-md border bg-card px-2 py-1.5 text-muted-foreground transition-[color,background-color,scale] duration-150 ease-out hover:text-foreground active:not-disabled:scale-[0.96]";

// Compact bordered text button for a list-row action (inbox Delete draft / Cancel / Archive).
export const ROW_ACTION_BUTTON =
  "shrink-0 rounded border px-2 py-1 text-xs transition-[background-color,scale] duration-150 ease-out hover:bg-accent active:not-disabled:scale-[0.96] disabled:opacity-50";
