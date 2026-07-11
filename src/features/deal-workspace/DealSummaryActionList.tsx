"use client";
import { Building2, Flag, Tag, User, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { DatePicker } from "@/components/ui/DatePicker";
import { updateDealAction } from "@/features/deals/updateAction";
import { InlineEditFooter } from "@/features/inline-edit/InlineEditFooter";
import { InlineFieldShell } from "@/features/inline-edit/InlineFieldShell";
import { saveErrorMessage } from "@/features/inline-edit/saveError";
import { formatCurrency } from "@/lib/formatCurrency";
import { formatMediumDate } from "@/lib/formatDate";
import { readCsrfToken } from "@/utils/csrfCookie";
import { LabelRow } from "./LabelRow";
import { ParticipantsControl } from "./ParticipantsControl";
import { InlineOrgField } from "./sidebar/InlineOrgField";

interface SummaryDeal {
  id: string;
  updatedAt: string | Date;
  value: number | null;
  expectedCloseDate: string | null;
  labels: string[];
}

const ICON = "h-4 w-4";

// One Summary row: PD's icon-gutter + content layout (no field labels). `right` carries the
// row's right-aligned shortcut (+ Participants on the person row).
function ActionRow({
  icon,
  children,
  right,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  right?: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <span className="flex w-4 shrink-0 justify-center text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
      {right !== undefined && <div className="shrink-0">{right}</div>}
    </div>
  );
}

// Pipedrive-exact deal Summary (minus out-of-scope Scores/Products/sequence/Project): an action
// list, not a label/value table. Values render as text or entity links; empty fields are blue
// CTAs ("Add labels", "Set expected close date"); "+ Participants" hangs on the person row.
// Owner lives in the page header, matching PD.
export function DealSummaryActionList({
  deal,
  person,
  org,
  orgOptions = [],
  baseCurrency,
}: {
  deal: SummaryDeal;
  person: { id: string; name: string } | null;
  org: { id: string; name: string } | null;
  orgOptions?: Array<{ id: string; name: string }>;
  baseCurrency: string;
}): React.ReactNode {
  const router = useRouter();
  const expectedUpdatedAt = new Date(deal.updatedAt).toISOString();
  const [editingValue, setEditingValue] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingDate, setEditingDate] = useState(false);
  const [dateDraft, setDateDraft] = useState<string | null>(deal.expectedCloseDate);
  const [errorId, setErrorId] = useState<string | null>(null);

  async function save(change: {
    value?: number | null;
    expectedCloseDate?: string | null;
  }): Promise<void> {
    const r = await updateDealAction(
      { dealId: deal.id, expectedUpdatedAt, ...change },
      readCsrfToken(),
    );
    setErrorId(r.ok ? null : r.error.id);
    router.refresh();
  }

  // Dirty + parseable gating for the value editor's Save (PD disables Save until the
  // draft differs; an unparseable draft must never commit).
  const trimmed = draft.trim();
  const parsedValue = trimmed === "" ? null : Number(trimmed);
  const valueValid = parsedValue === null || !Number.isNaN(parsedValue);
  const valueDirty = valueValid && parsedValue !== deal.value;

  function commitValue(): void {
    if (!valueDirty) return;
    setEditingValue(false);
    void save({ value: parsedValue });
  }

  return (
    <div className="text-sm">
      <ActionRow icon={<Wallet aria-hidden="true" className={ICON} />}>
        <InlineFieldShell
          label="Value"
          editing={editingValue}
          onStartEdit={() => {
            setDraft(deal.value !== null ? String(deal.value) : "");
            setEditingValue(true);
          }}
          value={formatCurrency(deal.value ?? 0, baseCurrency)}
        >
          <div>
            <input
              aria-label="Value"
              // biome-ignore lint/a11y/noAutofocus: inline edit focuses immediately on activation
              autoFocus
              inputMode="decimal"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitValue();
              }}
              className="h-8 w-full rounded border border-field-border bg-card px-2 text-left text-sm"
            />
            <InlineEditFooter
              onCancel={() => setEditingValue(false)}
              onSave={commitValue}
              saveDisabled={!valueDirty}
            />
          </div>
        </InlineFieldShell>
        {errorId !== null && (
          <span className="ml-2 text-xs text-destructive">{saveErrorMessage(errorId)}</span>
        )}
      </ActionRow>

      <ActionRow icon={<Building2 aria-hidden="true" className={ICON} />}>
        <InlineOrgField
          dealId={deal.id}
          expectedUpdatedAt={expectedUpdatedAt}
          org={org}
          orgOptions={orgOptions}
          onSaved={() => router.refresh()}
        />
      </ActionRow>

      {person !== null && (
        <ActionRow
          icon={<User aria-hidden="true" className={ICON} />}
          right={
            <ParticipantsControl
              dealId={deal.id}
              person={person}
              orgId={org?.id ?? null}
              orgName={org?.name ?? null}
            />
          }
        >
          <Link
            href={`/contacts/people/${person.id}`}
            className="font-semibold text-primary hover:underline"
          >
            {person.name}
          </Link>
        </ActionRow>
      )}

      <ActionRow icon={<Tag aria-hidden="true" className={ICON} />}>
        <LabelRow dealId={deal.id} expectedUpdatedAt={expectedUpdatedAt} labels={deal.labels} />
      </ActionRow>

      <ActionRow icon={<Flag aria-hidden="true" className={ICON} />}>
        <InlineFieldShell
          label="Expected close date"
          editing={editingDate}
          onStartEdit={() => {
            setDateDraft(deal.expectedCloseDate);
            setEditingDate(true);
          }}
          value={deal.expectedCloseDate !== null ? formatMediumDate(deal.expectedCloseDate) : null}
          emptyPrompt="Set expected close date"
        >
          <div>
            <DatePicker
              ariaLabel="Expected close date"
              value={dateDraft}
              placeholder="Set date"
              defaultOpen
              triggerClassName="flex h-8 w-full items-center rounded border border-field-border bg-card px-2 text-left text-sm"
              formatLabel={formatMediumDate}
              onChange={setDateDraft}
            />
            <InlineEditFooter
              onCancel={() => setEditingDate(false)}
              onSave={() => {
                if (dateDraft === deal.expectedCloseDate) return;
                setEditingDate(false);
                void save({ expectedCloseDate: dateDraft });
              }}
              saveDisabled={dateDraft === deal.expectedCloseDate}
            />
          </div>
        </InlineFieldShell>
      </ActionRow>
    </div>
  );
}
