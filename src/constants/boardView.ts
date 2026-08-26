// Debounce window (ms) for persisting the deals board toolbar view (owner filter, sort, applied
// filter). Batches rapid changes into a single best-effort write instead of one per change.
export const BOARD_VIEW_PERSIST_DEBOUNCE_MS = 500;
