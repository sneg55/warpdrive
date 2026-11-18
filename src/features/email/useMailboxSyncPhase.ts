"use client";

import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc-client";
import type { MailboxSyncPhase } from "./mailboxSyncPhase";
import { shouldRefreshInboxOnPhaseChange, syncPhasePollInterval } from "./syncPhasePolling";

export interface MailboxSyncPhaseState {
  phase: MailboxSyncPhase;
  refetch: () => Promise<unknown>;
}

export function useMailboxSyncPhase(
  mailbox: string | undefined,
  initialPhase: MailboxSyncPhase,
): MailboxSyncPhaseState {
  const utils = trpc.useUtils();
  const query = trpc.email.mailboxSyncPhase.useQuery(
    { mailbox },
    {
      initialData: initialPhase,
      refetchInterval: (q) => syncPhasePollInterval(q.state.data ?? initialPhase),
    },
  );
  const phase = query.data;
  const previous = useRef(phase);

  useEffect(() => {
    const was = previous.current;
    previous.current = phase;
    if (shouldRefreshInboxOnPhaseChange(was, phase)) void utils.email.inbox.list.invalidate();
  }, [phase, utils]);

  return { phase, refetch: () => query.refetch() };
}
