"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useColumns } from "@/components/data-table/useColumns";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { DEFAULT_BASE_CURRENCY } from "@/constants/currency";
import { STRINGS } from "@/constants/strings";
import { addFormCustomFieldDefs } from "@/features/custom-fields/CustomFieldCreateFields";
import { customFieldColumns } from "@/features/custom-fields/listColumns";
import { CustomFieldRefLabelsProvider } from "@/features/custom-fields/refLabelsContext";
import { trpc } from "@/lib/trpc-client";
import type { CustomFieldDef } from "@/types/customFields";
import { readCsrfToken } from "@/utils/csrfCookie";
import { ConvertLeadDialog } from "./ConvertLeadDialog";
import { BulkEditPanel } from "./inbox/BulkEditPanel";
import { LEAD_COLUMNS, type LeadColumn } from "./inbox/columns";
import { buildLeadExportHref } from "./inbox/exportHref";
import type { OwnerFilter } from "./inbox/LeadFilters";
import { LeadRowActions } from "./inbox/LeadRowActions";
import { LeadsActionBar } from "./inbox/LeadsActionBar";
import { LeadsEmpty } from "./inbox/LeadsEmpty";
import { LeadsFilterControls } from "./inbox/LeadsFilterControls";
import { LeadsLoadMore } from "./inbox/LeadsLoadMore";
import { LeadsTable } from "./inbox/LeadsTable";
import { useLeadConvert } from "./inbox/useLeadConvert";
import { useLeadList } from "./inbox/useLeadList";
import { useLeadSelection } from "./inbox/useLeadSelection";
import { type LeadSort, useLeadSort } from "./inbox/useLeadSort";
import { useLeadsViewPersist } from "./inbox/useLeadsViewPersist";
import type { LeadRow } from "./leadRepo";
import { archiveLeadAction, bulkUpdateLeadsAction } from "./leadServerActions";
import type { BulkUpdateLeadsInput, LeadConditionInput, LeadNextActivityBucket } from "./schemas";

type Filter = "inbox" | "archived";

export interface LeadsInboxProps {
  baseCurrency?: string;
  // Seeded from user_preferences.ui.leadsView (server); falls back to columns.ts defaults.
  initialView?: { columns: string[]; sort: LeadSort } | null;
  // Whether the actor holds data.import; gates the action bar's "Import leads" link.
  canImport?: boolean;
  customFieldDefs?: CustomFieldDef[];
}

export function LeadsInbox({
  baseCurrency,
  initialView,
  canImport = false,
  customFieldDefs = [],
}: LeadsInboxProps): React.ReactNode {
  const router = useRouter();
  const reportError = useActionError();
  const currency = baseCurrency ?? DEFAULT_BASE_CURRENCY;
  // Null on the server and the first client render so SSR and hydration produce identical markup
  // (a render-time `new Date()` differs between the two and causes a hydration mismatch). The real
  // clock is set on mount; time-based cell colors appear one frame later. See F5-16.
  const [now, setNow] = useState<Date | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the clock during render would differ between SSR and hydration; the mount effect is the fix, not the bug
  useEffect(() => setNow(new Date()), []);

  const [filter, setFilter] = useState<Filter>("inbox");
  const [labelKeys, setLabelKeys] = useState<string[]>([]);
  const [nextActivity, setNextActivity] = useState<LeadNextActivityBucket | null>(null);
  const [ownerIds, setOwnerIds] = useState<string[]>([]);
  const [condition, setCondition] = useState<LeadConditionInput | null>(null);

  const sort = useLeadSort(initialView?.sort ?? null);
  const selection = useLeadSelection();
  const catalog = useMemo<readonly LeadColumn[]>(
    () => [...LEAD_COLUMNS, ...customFieldColumns(customFieldDefs)],
    [customFieldDefs],
  );
  const columns = useColumns(catalog, initialView?.columns);

  // Ungated: every user gets the full active-user list so owner filtering runs server-side by id.
  const usersQ = trpc.identity.assignableUsers.useQuery(undefined, { retry: false });
  const dealFieldsQ = trpc.customFields.listDefs.useQuery({ target: "deal" });
  const dealFields = dealFieldsQ.data ?? [];
  const users = useMemo(
    () => (usersQ.data ?? []).map((u) => ({ id: u.id, name: u.name })),
    [usersQ.data],
  );

  const list = useLeadList({
    filter,
    sort: sort.effective,
    ownerIds,
    labelKeys,
    nextActivity,
    condition,
  });
  const rows = list.rows;

  const visibleIds = useMemo(() => rows.map((r) => r.id), [rows]);

  async function refetch(): Promise<void> {
    await list.refetch();
  }

  async function bulkChange(ids: string[], change: BulkUpdateLeadsInput["change"]): Promise<void> {
    if (ids.length === 0) return;
    const r = await bulkUpdateLeadsAction({ ids, change }, readCsrfToken());
    if (r.ok) {
      selection.clear();
      await refetch();
    } else reportError(r.error.id);
  }

  const {
    convertError,
    convertTarget,
    setConvertTarget,
    bulkConvertPending,
    bulkConvert,
    convertRow,
  } = useLeadConvert({
    refetch,
    clearSelection: selection.clear,
    goToDeal: (dealId) => router.push(`/deals/${dealId}`),
  });

  async function archiveToggle(id: string, archived: boolean): Promise<void> {
    const r = await archiveLeadAction({ leadId: id, archived }, readCsrfToken());
    if (r.ok) await refetch();
    else reportError(r.error.id);
  }

  // Export the FULL server-filtered result set: navigate to the route with the current filter,
  // sort, inline condition, and visible-column order as query params. The route re-applies the
  // visibility gate and streams text/csv (not just the loaded page).
  function exportCsv(): void {
    window.location.href = buildLeadExportHref({
      filter,
      sort: sort.effective,
      ownerIds,
      labelKeys,
      nextActivity,
      columns: columns.order,
      condition,
    });
  }

  useLeadsViewPersist(columns.order, sort.effective);

  const owner: OwnerFilter = { users, selected: ownerIds, onChange: setOwnerIds };

  const archived = filter === "archived";
  const hasFilter =
    ownerIds.length > 0 || labelKeys.length > 0 || nextActivity !== null || condition !== null;

  function clearFilters(): void {
    setOwnerIds([]);
    setLabelKeys([]);
    setNextActivity(null);
    setCondition(null);
  }

  // Zero rows while the first page is still in flight is not an empty inbox, so the message waits
  // for the read to land rather than accusing the user of having no leads.
  const empty =
    list.isLoading || rows.length > 0 ? null : (
      <LeadsEmpty
        archived={archived}
        hasFilter={hasFilter}
        baseCurrency={baseCurrency}
        onCreated={() => void refetch()}
        onClearFilters={clearFilters}
        onBackToInbox={() => setFilter("inbox")}
      />
    );

  function renderRowActions(row: LeadRow): React.ReactNode {
    return (
      <LeadRowActions
        archived={row.archivedAt !== null}
        converted={row.convertedDealId !== null}
        assignableUsers={users}
        onOpen={() => router.push(`/leads/${row.id}`)}
        onConvert={() => {
          if (addFormCustomFieldDefs(dealFields).length > 0) setConvertTarget(row);
          else void convertRow(row);
        }}
        onArchiveToggle={() => void archiveToggle(row.id, row.archivedAt === null)}
        onDelete={() => void bulkChange([row.id], { deleted: true })}
        onChangeOwner={(ownerId) => void bulkChange([row.id], { ownerId })}
      />
    );
  }

  return (
    <div className="flex h-full flex-col p-4">
      <h1 className="mb-3 text-display font-[450] leading-tight tracking-tight">
        {STRINGS.nav.leads}
      </h1>
      <LeadsActionBar
        filter={filter}
        onFilter={setFilter}
        count={list.total}
        baseCurrency={baseCurrency}
        canImport={canImport}
        onCreated={() => void refetch()}
        labelKeys={labelKeys}
        onLabelKeys={setLabelKeys}
        nextActivity={nextActivity}
        onNextActivity={setNextActivity}
        owner={owner}
        catalog={catalog}
        order={columns.order}
        visibleKeys={columns.visibleKeys}
        onToggleColumn={columns.toggle}
        onReorderColumn={columns.reorder}
        onExport={exportCsv}
        filterBuilder={
          <LeadsFilterControls users={users} condition={condition} onCondition={setCondition} />
        }
      />

      {convertError !== null && (
        <div
          role="alert"
          className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {convertError}
        </div>
      )}

      {selection.count > 0 && (
        <div className="mb-3">
          <BulkEditPanel
            count={selection.count}
            archived={archived}
            assignableUsers={users}
            onApply={(change) => void bulkChange([...selection.selected], change)}
            onConvert={() => {
              if (addFormCustomFieldDefs(dealFields).length > 0) setConvertTarget("bulk");
              else void bulkConvert([...selection.selected]);
            }}
            converting={bulkConvertPending}
            onClear={selection.clear}
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
        {/* Nothing exists and nothing is filtered: the header row, select-all and sort controls
            are machinery over zero rows, so the table goes and the empty state stands alone.
            A filtered-to-nothing list keeps its columns, since the columns are still the view. */}
        {empty !== null && !hasFilter ? (
          empty
        ) : (
          <CustomFieldRefLabelsProvider value={list.refLabels}>
            <LeadsTable
              rows={rows}
              columns={columns.visibleColumns}
              now={now}
              currency={currency}
              sort={sort.effective}
              onSort={sort.cycle}
              isSelected={selection.isSelected}
              allSelected={selection.allSelected(visibleIds)}
              onToggleRow={selection.toggle}
              onToggleAll={() => selection.toggleAll(visibleIds)}
              onOpen={(id) => router.push(`/leads/${id}`)}
              renderRowActions={renderRowActions}
              empty={empty}
            />
          </CustomFieldRefLabelsProvider>
        )}
      </div>

      {list.canLoadMore && <LeadsLoadMore onClick={list.loadMore} />}

      {convertTarget !== null && (
        <ConvertLeadDialog
          defs={dealFields}
          onClose={() => setConvertTarget(null)}
          onConvert={(customFields) =>
            convertTarget === "bulk"
              ? bulkConvert([...selection.selected], customFields)
              : convertRow(convertTarget, customFields)
          }
        />
      )}
    </div>
  );
}
