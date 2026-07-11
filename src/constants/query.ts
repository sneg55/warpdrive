// How long a tRPC read stays fresh before TanStack Query will refetch it on remount.
// Reads in this CRM are user-scoped and change on the user's own mutations (which invalidate
// explicitly), so a short window is safe and cuts the refetch storm a bare QueryClient causes.
export const QUERY_STALE_TIME_MS = 30_000;
