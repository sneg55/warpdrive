"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { updateDealAction } from "@/features/deals/updateAction";
import { EditableHeading } from "@/features/inline-edit/EditableHeading";
import type { InlineSaveResult } from "@/features/inline-edit/useInlineEditField";
import { readCsrfToken } from "@/utils/csrfCookie";

interface EditableTitleProps {
  dealId: string;
  title: string;
  // CAS precondition: the deal's updatedAt ISO string.
  expectedUpdatedAt: string;
}

// Deal-title variant of the shared inline field. Only calls the action when the value changed and
// is non-empty (schema requires 1..255).
export function EditableTitle({
  dealId,
  title,
  expectedUpdatedAt,
}: EditableTitleProps): React.ReactNode {
  const router = useRouter();

  async function commit(next: string): Promise<InlineSaveResult> {
    const r = await updateDealAction({ dealId, expectedUpdatedAt, title: next }, readCsrfToken());
    router.refresh(); // stale CAS or error: re-sync from the server (reverts the input)
    return r.ok ? { ok: true, value: undefined } : { ok: false, error: r.error.id };
  }

  return <EditableHeading title={title} label="deal title" onCommit={commit} />;
}
