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
  // The DB-joined owner name (getLeadById), present regardless of the owner's is_active status.
  // Used as a fallback so a deactivated owner (absent from `owners`, the assignable-users list)
  // still renders their real name instead of the "+ Add" placeholder.
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
  // Test seam / alternate refresh strategy. Defaults to router.refresh().
  onSaved?: () => void;
}

type LeadFieldChange = Partial<{
  value: number | null;
  ownerId: string;
  expectedCloseDate: string | null;
}>;

// Click-to-edit-in-place Summary rows (value/owner/expected close), autosaving through
// updateLeadAction under the lead's CAS precondition (expectedUpdatedAt). Mirrors
// DealSummaryEditPanel, except Owner IS editable here (leads have no separate OwnerBlock-style
// reassignment surface): the server (updateLead) re-gates the change on deal.changeOwner, so a
// non-privileged actor sees a save error rather than a silently-ignored click.
export function LeadSummaryEditPanel({
  lead,
  owners,
  onSaved,
}: LeadSummaryEditPanelProps): React.ReactNode {
  const router = useRouter();
  const expectedUpdatedAt = new Date(lead.updatedAt).toISOString();
  // leads.owner_id is NOT NULL, so the lead always has a real owner, but `owners`
  // (trpc.identity.assignableUsers) filters is_active = true and can omit a since-deactivated
  // owner. Union in a synthetic entry built from the DB-joined ownerName so the current owner is
  // always resolvable, both for the view-mode badge (renderValue) and the edit-mode dropdown.
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
    // Resync on both success AND failure: a stale-CAS failure means expectedUpdatedAt (derived
    // from the lead prop) is already behind the server's row, so the next edit needs the
    // refreshed prop too. Matches DealSummaryEditPanel.
    if (onSaved !== undefined) onSaved();
    else router.refresh();
    return r.ok ? ok(r.value) : err(r.error.id);
  }

  function ownerBadgeFor(ownerId: string): React.ReactNode {
    const match = owners.find((o) => o.id === ownerId);
    // Fall back to the DB-joined ownerName (not just null) when the current owner isn't in the
    // assignable-users list, so a deactivated owner still shows their real name.
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
