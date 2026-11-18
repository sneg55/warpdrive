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
  expectedUpdatedAt: string;
}

export function EditableTitle({
  dealId,
  title,
  expectedUpdatedAt,
}: EditableTitleProps): React.ReactNode {
  const router = useRouter();

  async function commit(next: string): Promise<InlineSaveResult> {
    const r = await updateDealAction({ dealId, expectedUpdatedAt, title: next }, readCsrfToken());
    router.refresh();
    return r.ok ? { ok: true, value: undefined } : { ok: false, error: r.error.id };
  }

  return <EditableHeading title={title} label="deal title" onCommit={commit} />;
}
