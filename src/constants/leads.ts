// Page size for the leads inbox query. Client-side filtering/sorting operates on the loaded page,
// so this caps how many leads are fetched at once (documented limitation in LeadsInbox).
export const LEADS_PAGE_LIMIT = 200;

// Debounce window (ms) for persisting Leads Inbox view prefs (columns + sort). Batches rapid
// toggles/reorders into a single best-effort write instead of one per change.
export const PERSIST_DEBOUNCE_MS = 500;
