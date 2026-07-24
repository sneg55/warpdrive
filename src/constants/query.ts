// How long a tRPC read stays fresh before TanStack Query will refetch it on remount.
// Reads in this CRM are user-scoped and change on the user's own mutations (which invalidate
// explicitly), so a short window is safe and cuts the refetch storm a bare QueryClient causes.
export const QUERY_STALE_TIME_MS = 30_000;

// How long an unused (unmounted) read stays in cache before garbage collection. Must exceed
// TanStack Query's 5-minute default to actually widen retention (setting it to the default is a
// no-op): 30 minutes keeps a section warm across a focused work session, so bouncing between
// Pipeline / Leads / Contacts and back paints instantly (then refetches in the background) instead
// of cold-mounting. Freshness is unaffected: staleTime still governs when a mounted query refetches,
// and mutations invalidate their keys explicitly, so the user never sees their own change as stale.
export const QUERY_GC_TIME_MS = 30 * 60_000;
