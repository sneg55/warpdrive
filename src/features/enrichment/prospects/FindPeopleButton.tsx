"use client";

import type React from "react";
import { useState } from "react";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import { trpc } from "@/lib/trpc-client";
import { FindPeopleDialog } from "./FindPeopleDialog";

const STATUS_STALE_MS = 60_000;

export interface FindPeopleItem {
  label: string;
  onSelect: () => void;
}

export function FindPeopleButton({
  orgId,
  orgName,
  children,
}: {
  orgId: string;
  orgName: string;
  children: (item: FindPeopleItem | null) => React.ReactNode;
}): React.ReactNode {
  const statusQuery = trpc.enrichment.status.useQuery(undefined, {
    staleTime: STATUS_STALE_MS,
    retry: false,
  });
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const ready = statusQuery.data?.ready === true;

  return (
    <>
      {children(
        ready
          ? {
              label: ENRICHMENT_STRINGS.prospects.trigger,
              onSelect: () => {
                setEverOpened(true);
                setOpen(true);
              },
            }
          : null,
      )}
      {everOpened ? (
        <FindPeopleDialog orgId={orgId} orgName={orgName} open={open} onOpenChange={setOpen} />
      ) : null}
    </>
  );
}
