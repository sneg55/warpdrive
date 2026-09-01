"use client";
import { trpc } from "@/lib/trpc-client";

export function useInvalidateActivityLists(): () => Promise<void> {
  const utils = trpc.useUtils();
  return async () => {
    await Promise.all([
      utils.activities.dayLoad.invalidate(),
      utils.activities.listRows.invalidate(),
    ]);
  };
}
