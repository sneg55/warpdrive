"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { updateDealAction } from "@/features/deals/updateAction";
import { InlineTextField } from "@/features/inline-edit/InlineTextField";
import { err, ok, type Result } from "@/types/result";
import { readCsrfToken } from "@/utils/csrfCookie";
import { FieldRow } from "./FieldRow";

interface SourceChannelIdFieldProps {
  dealId: string;
  updatedAt: string | Date;
  sourceChannelId: string | null;
}

// Free-text external source identifier (Source section). Inline-editable through updateDealAction
// under the deal's CAS precondition; refresh on both branches so a stale CAS picks up the advanced
// updatedAt next render. Mirrors SourceChannelField but a text value rather than a fixed enum.
export function SourceChannelIdField({
  dealId,
  updatedAt,
  sourceChannelId,
}: SourceChannelIdFieldProps): React.ReactNode {
  const router = useRouter();
  const expectedUpdatedAt = new Date(updatedAt).toISOString();

  async function save(value: string): Promise<Result<unknown, string>> {
    const trimmed = value.trim();
    const r = await updateDealAction(
      { dealId, expectedUpdatedAt, sourceChannelId: trimmed === "" ? null : trimmed },
      readCsrfToken(),
    );
    router.refresh();
    return r.ok ? ok(r.deal) : err(r.error.id);
  }

  return (
    <FieldRow label="Channel ID" empty={sourceChannelId === null}>
      <InlineTextField label="Channel ID" value={sourceChannelId ?? ""} onSave={save} />
    </FieldRow>
  );
}
