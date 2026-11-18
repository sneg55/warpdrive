"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { ERROR_IDS } from "@/constants/errorIds";
import { CatalogLabelPicker } from "@/features/labels/CatalogLabelPicker";
import { resolveLabelChips } from "@/features/labels/resolveLabels";
import { updateLeadAction } from "@/features/leads/leadServerActions";
import { trpc } from "@/lib/trpc-client";
import { useSyncedState } from "@/lib/useSyncedState";
import { readCsrfToken } from "@/utils/csrfCookie";

export function LeadLabelRow({
  leadId,
  expectedUpdatedAt,
  labels,
}: {
  leadId: string;
  expectedUpdatedAt: string;
  labels: string[];
}): React.ReactNode {
  const router = useRouter();
  const reportError = useActionError();
  const [current, setCurrent] = useSyncedState<string[]>(labels);
  const [expected, setExpected] = useSyncedState<string>(expectedUpdatedAt);
  const [pending, setPending] = useState(false);
  const [stale, setStale] = useState(false);
  const catalog = trpc.labels.listByTarget.useQuery({ target: "lead" }).data ?? [];

  async function onChange(next: string[]): Promise<void> {
    if (pending) return;
    setPending(true);
    setCurrent(next);
    const r = await updateLeadAction(
      { leadId, expectedUpdatedAt: expected, labels: next },
      readCsrfToken(),
    );
    setPending(false);
    if (r.ok) {
      setStale(false);
      setExpected(new Date(r.value.updatedAt).toISOString());
      router.refresh();
      return;
    }
    setCurrent(labels);
    if (r.error.id === ERROR_IDS.LEAD_PRECONDITION) {
      setStale(true);
      router.refresh();
      return;
    }
    reportError(r.error.id);
  }

  const chips = resolveLabelChips(catalog, current);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {chips.map((chip) => (
          <span
            key={chip.name}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${chip.classes}`}
          >
            {chip.name}
          </span>
        ))}
        <CatalogLabelPicker
          target="lead"
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
