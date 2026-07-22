"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { updateOrgAction, updatePersonAction } from "@/features/contacts/actions";
import { CatalogLabelPicker } from "@/features/labels/CatalogLabelPicker";
import { resolveLabelChips } from "@/features/labels/resolveLabels";
import { trpc } from "@/lib/trpc-client";
import { useSyncedState } from "@/lib/useSyncedState";
import { readCsrfToken } from "@/utils/csrfCookie";

// Person/org "Add labels" control (spec B5): renders the record's label chips and a popover that
// toggles labels through the catalog-driven CatalogLabelPicker, committing via updatePersonAction /
// updateOrgAction. Optimistic; reverts on failure AND surfaces the shared app-shell error dialog so
// a denied edit reads as "denied", not "flaky". No CAS (the contact update actions overwrite the
// labels field directly, unlike the deal LabelRow's expectedUpdatedAt). Rendered on the contact
// detail header and, opt-in, inside the shared Person/Organization sidebar sections.
export function ContactLabelsControl({
  entityType,
  entityId,
  labels,
}: {
  entityType: "person" | "organization";
  entityId: string;
  labels: string[];
}): React.ReactNode {
  const router = useRouter();
  const reportError = useActionError();
  // Re-seeds when a router.refresh() delivers new props.
  const [current, setCurrent] = useSyncedState<string[]>(labels);
  const [pending, setPending] = useState(false);

  const catalog = trpc.labels.listByTarget.useQuery({ target: entityType }).data ?? [];
  const chips = resolveLabelChips(catalog, current);

  async function onChange(next: string[]): Promise<void> {
    if (pending) return;
    setPending(true);
    setCurrent(next); // optimistic
    const action = entityType === "person" ? updatePersonAction : updateOrgAction;
    const r = await action({ id: entityId, labels: next }, readCsrfToken());
    setPending(false);
    if (r.ok) {
      router.refresh();
      return;
    }
    setCurrent(labels); // revert on failure
    // Surface the shared modal so the reverted toggle reads as "denied", not "flaky".
    reportError(r.error.id);
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.name}
          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${chip.classes}`}
        >
          {chip.name}
        </span>
      ))}
      <CatalogLabelPicker
        target={entityType}
        value={current}
        onChange={(next) => void onChange(next)}
      />
    </div>
  );
}
