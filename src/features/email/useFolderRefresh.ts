"use client";

import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc-client";
import type { ThreadFolder } from "./ThreadRow";

export interface FolderRefresh {
  refreshing: boolean;
  refresh: () => void;
}

export function useFolderRefresh(
  folder: ThreadFolder,
  extra?: () => Promise<unknown>,
): FolderRefresh {
  const utils = trpc.useUtils();
  const inFlight = useRef(false);
  const [refreshing, setRefreshing] = useState(false);

  function reads(): Promise<unknown>[] {
    const shared: Promise<unknown>[] = [utils.email.search.invalidate()];
    if (extra !== undefined) shared.push(extra());
    if (folder === "sent") return [...shared, utils.email.folders.sent.invalidate()];
    if (folder === "archive") return [...shared, utils.email.folders.archive.invalidate()];
    return [
      ...shared,
      utils.email.inbox.list.invalidate(),
      utils.email.inbox.unreadCount.invalidate(),
    ];
  }

  async function run(): Promise<void> {
    try {
      await Promise.allSettled(reads());
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }

  function refresh(): void {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    void run();
  }

  return { refreshing, refresh };
}
