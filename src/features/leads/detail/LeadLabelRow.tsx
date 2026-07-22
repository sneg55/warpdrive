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

// Inline label editor for the lead-sidebar Summary section (Pipedrive parity: leads carry their
// own labels just like deals). Mirrors the deal LabelRow: wraps the shared CatalogLabelPicker and
// commits each change through updateLeadAction under the CAS precondition (expectedUpdatedAt).
// Holds optimistic local state for the labels and the expected timestamp so a quick second edit
// uses the freshly-advanced updatedAt (from the success response) rather than the stale prop,
// which would otherwise CAS-fail against its own prior write. Errors surface through the app-shell
// ActionErrorProvider (leads use the shared reporter, not the deal-specific one).
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
  // Both re-seed from the server once a router.refresh() delivers new props.
  const [current, setCurrent] = useSyncedState<string[]>(labels);
  const [expected, setExpected] = useSyncedState<string>(expectedUpdatedAt);
  const [pending, setPending] = useState(false);
  const [stale, setStale] = useState(false);
  const catalog = trpc.labels.listByTarget.useQuery({ target: "lead" }).data ?? [];

  async function onChange(next: string[]): Promise<void> {
    if (pending) return;
    setPending(true);
    setCurrent(next); // optimistic: reflect the toggle immediately
    const r = await updateLeadAction(
      { leadId, expectedUpdatedAt: expected, labels: next },
      readCsrfToken(),
    );
    setPending(false);
    if (r.ok) {
      setStale(false);
      setExpected(new Date(r.value.updatedAt).toISOString()); // advance so back-to-back edits pass CAS
      router.refresh();
      return;
    }
    setCurrent(labels); // revert the optimistic change on failure
    // CAS-fail (E_LEAD_007 = LEAD_PRECONDITION): the lead moved under us. Surface a stale hint and
    // refresh so the row reloads the server-true labels and expectedUpdatedAt on the next render.
    if (r.error.id === ERROR_IDS.LEAD_PRECONDITION) {
      setStale(true);
      router.refresh();
      return;
    }
    // Any other failure (a non-owner hitting E_PERM_001, a dead session) must not revert with no
    // explanation. Surface the shared modal so the reverted toggle reads as "denied", not "flaky".
    reportError(r.error.id);
  }

  // Active labels render as solid chips (colored from the catalog); the catalog dropdown picker
  // sits alongside them, matching the deal sidebar's label row.
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
