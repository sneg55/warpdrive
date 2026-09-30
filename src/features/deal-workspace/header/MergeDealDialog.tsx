"use client";
import { keepPreviousData } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDealActionError } from "@/features/deal-workspace/DealActionErrorProvider";
import { mergeDealsAction } from "@/features/deal-workspace/mergeDealsAction";
import type { FilterDefinition } from "@/features/saved-filters/schemas";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";

const SEARCH_DEBOUNCE_MS = 150;

interface MergeCandidate {
  id: string;
  title: string;
  updatedAt: string | Date;
}

function isNewer(candidate: MergeCandidate, than: MergeCandidate): boolean {
  return new Date(candidate.updatedAt).getTime() > new Date(than.updatedAt).getTime();
}

function titleSearch(query: string): FilterDefinition | undefined {
  const q = query.trim();
  if (q === "") return undefined;
  return { combinator: "and", conditions: [{ field: "title", op: "contains", value: q }] };
}

export function MergeDealDialog({
  dealId,
  pipelineId,
  expectedUpdatedAt,
  open,
  onOpenChange,
}: {
  dealId: string;
  pipelineId: string;
  expectedUpdatedAt: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.ReactNode {
  const router = useRouter();
  const reportError = useDealActionError();
  const [picked, setPicked] = useState<MergeCandidate | null>(null);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  const listQ = trpc.deal.list.useQuery(
    { pipelineId, definition: titleSearch(debounced) },
    { enabled: open, retry: false, placeholderData: keepPreviousData },
  );
  const rows = listQ.data?.rows;
  const fresh = picked === null ? undefined : rows?.find((d) => d.id === picked.id);
  if (picked !== null && fresh !== undefined && isNewer(fresh, picked)) setPicked(fresh);
  const candidates = useMemo<MergeCandidate[]>(() => {
    const visible = (rows ?? []).filter((d) => d.id !== dealId);
    if (picked === null || visible.some((d) => d.id === picked.id)) return visible;
    return [picked, ...visible];
  }, [rows, dealId, picked]);
  const options = useMemo<ComboboxOption[]>(
    () => candidates.map((d) => ({ value: d.id, label: d.title })),
    [candidates],
  );

  function pick(id: string): void {
    setPicked(candidates.find((d) => d.id === id) ?? null);
  }

  async function confirm(): Promise<void> {
    if (picked === null) return;
    setPending(true);
    const r = await mergeDealsAction(
      {
        targetDealId: picked.id,
        sourceDealId: dealId,
        expectedTargetUpdatedAt: new Date(picked.updatedAt).toISOString(),
        expectedSourceUpdatedAt: expectedUpdatedAt,
      },
      readCsrfToken(),
    );
    setPending(false);
    if (r.ok) {
      onOpenChange(false);
      router.replace(`/deals/${r.deal.id}`);
    } else {
      reportError(r.error.id);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Merge deals</DialogTitle>
          <DialogDescription>
            Pick the deal to merge this deal into. Its activities, notes, emails, participants, and
            followers move to that deal, this deal is deleted, and you land on the merged deal. This
            cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <Combobox
          value={picked?.id ?? ""}
          onChange={pick}
          options={options}
          search={{ value: query, onChange: setQuery }}
          ariaLabel="Deal to merge in"
          placeholder="Merge into"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => void confirm()} disabled={pending || picked === null}>
            Merge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
