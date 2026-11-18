import { trpc } from "@/lib/trpc-client";

export function useVersion() {
  return trpc.version.get.useQuery(undefined, {
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
