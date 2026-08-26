// Shared hover surface for a compact inline control whose visible text is part of the control:
// the composer's visibility picker and every ToggleField read as one hit area that fills on hover.
// Callers that own focus (a button trigger) append their own focus-visible ring.
export const INLINE_CONTROL_SURFACE =
  "flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors select-none hover:bg-accent hover:text-foreground";
