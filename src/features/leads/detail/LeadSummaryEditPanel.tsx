"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import type { SelectOption } from "@/components/ui/Select";
import { FieldRow } from "@/features/deal-workspace/sidebar/FieldRow";
import { OwnerBadge } from "@/features/identity/OwnerBadge";
import { InlineDateField } from "@/features/inline-edit/InlineDateField";
import { InlineSelectField } from "@/features/inline-edit/InlineSelectField";
import { InlineTextField } from "@/features/inline-edit/InlineTextField";
import { updateLeadAction } from "@/features/leads/leadServerActions";
import { err, ok, type Result } from "@/types/result";
import { readCsrfToken } from "@/utils/csrfCookie";

interface PanelLead {
  id: string;
  updatedAt: string | Date;
  value: number | string | null;
  ownerId: string;
  ownerName: string | null;
  expectedCloseDate: string | null;
}

interface LeadOwner {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

interface LeadSummaryEditPanelProps {
  lead: PanelLead;
  owners: LeadOwner[];
  onSaved?: () => void;
}

type LeadFieldChange = Partial<{
  value: number | null;
  ownerId: string;
  expectedCloseDate: string | null;
}>;

export function LeadSummaryEditPanel({
  lead,
  owners,
  onSaved,
}: LeadSummaryEditPanelProps): React.ReactNode {
  const router = useRouter();
  const expectedUpdatedAt = new Date(lead.updatedAt).toISOString();
  const ownerOptions: SelectOption[] = owners.some((o) => o.id === lead.ownerId)
    ? owners.map((o) => ({ value: o.id, label: o.name }))
    : [
        { value: lead.ownerId, label: lead.ownerName ?? "" },
        ...owners.map((o) => ({ value: o.id, label: o.name })),
      ];
  const value = lead.value === null ? null : Number(lead.value);

  async function save(change: LeadFieldChange): Promise<Result<unknown, string>> {
    const r = await updateLeadAction(
      { leadId: lead.id, expectedUpdatedAt, ...change },
      readCsrfToken(),
    );
    if (onSaved !== undefined) onSaved();
    else router.refresh();
    return r.ok ? ok(r.value) : err(r.error.id);
  }

  function ownerBadgeFor(ownerId: string): React.ReactNode {
    const match = owners.find((o) => o.id === ownerId);
    const name = match?.name ?? (ownerId === lead.ownerId ? lead.ownerName : null);
    return <OwnerBadge name={name} avatarUrl={match?.avatarUrl ?? null} />;
  }

  return (
    <>
      <FieldRow label="Value" empty={value === null}>
        <InlineTextField
          label="Value"
          value={value !== null ? String(value) : ""}
          onSave={(v) => save({ value: v.trim() === "" ? null : Number(v) })}
          placeholder="+ Add value"
        />
      </FieldRow>
      <FieldRow label="Owner">
        <InlineSelectField
          label="Owner"
          value={lead.ownerId}
          options={ownerOptions}
          onSave={(v) => save({ ownerId: v })}
          renderValue={ownerBadgeFor}
        />
      </FieldRow>
      <FieldRow label="Expected close" empty={lead.expectedCloseDate === null}>
        <InlineDateField
          label="Expected close"
          value={lead.expectedCloseDate}
          onSave={(v) => save({ expectedCloseDate: v })}
        />
      </FieldRow>
    </>
  );
}
