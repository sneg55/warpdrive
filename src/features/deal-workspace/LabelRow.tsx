"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { ERROR_IDS } from "@/constants/errorIds";
import { updateDealAction } from "@/features/deals/updateAction";
import { CatalogLabelPicker } from "@/features/labels/CatalogLabelPicker";
import { resolveLabelChips } from "@/features/labels/resolveLabels";
import { trpc } from "@/lib/trpc-client";
import { useSyncedState } from "@/lib/useSyncedState";
import { readCsrfToken } from "@/utils/csrfCookie";
import { useDealActionError } from "./DealActionErrorProvider";

export function LabelRow({
  dealId,
  expectedUpdatedAt,
  labels,
}: {
  dealId: string;
  expectedUpdatedAt: string;
  labels: string[];
}): React.ReactNode {
  const router = useRouter();
  const reportError = useDealActionError();
  const [current, setCurrent] = useSyncedState<string[]>(labels);
  const [expected, setExpected] = useSyncedState<string>(expectedUpdatedAt);
  const [pending, setPending] = useState(false);
  const [stale, setStale] = useState(false);
  const catalog = trpc.labels.listByTarget.useQuery({ target: "deal" }).data ?? [];

  async function onChange(next: string[]): Promise<void> {
    if (pending) return;
    setPending(true);
    setCurrent(next);
    const r = await updateDealAction(
      { dealId, expectedUpdatedAt: expected, labels: next },
      readCsrfToken(),
    );
    setPending(false);
    if (r.ok) {
      setStale(false);
      setExpected(new Date(r.deal.updatedAt).toISOString());
      router.refresh();
      return;
    }
    setCurrent(labels);
    if (r.error.id === ERROR_IDS.DEAL_PRECONDITION) {
      setStale(true);
      router.refresh();
      return;
    }
    reportError(r.error.id);
  }

  const chips = resolveLabelChips(catalog, current);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {chips.map((chip) => (
          <span
            key={chip.name}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${chip.classes}`}
          >
            {chip.name}
          </span>
        ))}
        <CatalogLabelPicker
          target="deal"
          value={current}
          onChange={(next) => void onChange(next)}
        />
      </div>
      {stale ? (
        <p className="mt-1 text-xs text-muted-foreground">Labels changed elsewhere; reloaded.</p>
      ) : null}
    </div>
  );
}
