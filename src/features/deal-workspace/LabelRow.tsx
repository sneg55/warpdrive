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

// Inline label editor for the deal-sidebar Summary section. Wraps the shared LabelToggle and
// commits each change through updateDealAction under the CAS precondition (expectedUpdatedAt).
// Holds optimistic local state for the labels and the expected timestamp so a quick second edit
// uses the freshly-advanced updatedAt (from the success response) rather than the stale prop,
// which would otherwise CAS-fail against its own prior write.
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
  // Both re-seed from the server once a router.refresh() delivers new props.
  const [current, setCurrent] = useSyncedState<string[]>(labels);
  const [expected, setExpected] = useSyncedState<string>(expectedUpdatedAt);
  const [pending, setPending] = useState(false);
  const [stale, setStale] = useState(false);
  const catalog = trpc.labels.listByTarget.useQuery({ target: "deal" }).data ?? [];

  async function onChange(next: string[]): Promise<void> {
    if (pending) return;
    setPending(true);
    setCurrent(next); // optimistic: reflect the toggle immediately
    const r = await updateDealAction(
      { dealId, expectedUpdatedAt: expected, labels: next },
      readCsrfToken(),
    );
    setPending(false);
    if (r.ok) {
      setStale(false);
      setExpected(new Date(r.deal.updatedAt).toISOString()); // advance so back-to-back edits pass CAS
      router.refresh();
      return;
    }
    setCurrent(labels); // revert the optimistic change on failure
    // CAS-fail (E_DEAL_002 = DEAL_PRECONDITION): the deal moved under us. Surface a stale hint and
    // refresh so the row reloads the server-true labels and expectedUpdatedAt on the next render.
    if (r.error.id === ERROR_IDS.DEAL_PRECONDITION) {
      setStale(true);
      router.refresh();
      return;
    }
    // Any other failure (a non-owner hitting E_PERM_001, a dead session) used to revert with no
    // explanation. Surface the shared modal so the reverted toggle reads as "denied", not "flaky".
    reportError(r.error.id);
  }

  // Active labels render as solid chips (colored from the catalog); the catalog dropdown picker
  // sits alongside them, matching the person/org header control.
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
