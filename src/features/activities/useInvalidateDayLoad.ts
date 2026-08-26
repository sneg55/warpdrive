"use client";
import { trpc } from "@/lib/trpc-client";

export function useInvalidateDayLoad(): () => Promise<void> {
  const utils = trpc.useUtils();
  return async () => {
    await utils.activities.dayLoad.invalidate();
  };
}
