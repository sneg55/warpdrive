import { trpc } from "@/lib/trpc-client";

// One-hour cache: the update banner does not need fresher data, and the cron job on the worker
// only refreshes every 6 hours anyway. No refetch on focus, no retry (a failed check is silent).
export function useVersion() {
  return trpc.version.get.useQuery(undefined, {
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
