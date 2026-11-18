"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useColumns } from "@/components/data-table/useColumns";
import { DEFAULT_BASE_CURRENCY } from "@/constants/currency";
import { STRINGS } from "@/constants/strings";
import { addFormCustomFieldDefs } from "@/features/custom-fields/CustomFieldCreateFields";
import { customFieldColumns } from "@/features/custom-fields/listColumns";
import { CustomFieldRefLabelsProvider } from "@/features/custom-fields/refLabelsContext";
import { trpc } from "@/lib/trpc-client";
import type { CustomFieldDef } from "@/types/customFields";
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
import { useLeadExport } from "./inbox/useLeadExport";
import { useLeadList } from "./inbox/useLeadList";
import { useLeadMutations } from "./inbox/useLeadMutations";
import { useLeadSelection } from "./inbox/useLeadSelection";
import { type LeadSort, useLeadSort } from "./inbox/useLeadSort";
import { useLeadsViewPersist } from "./inbox/useLeadsViewPersist";
import type { LeadRow } from "./leadRepo";
import type { LeadConditionInput, LeadNextActivityBucket } from "./schemas";

type Filter = "inbox" | "archived";

export interface LeadsInboxProps {
  baseCurrency?: string;
  initialView?: { columns: string[]; sort: LeadSort } | null;
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
  const currency = baseCurrency ?? DEFAULT_BASE_CURRENCY;
  const [now, setNow] = useState<Date | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const { applying, isRowBusy, bulkChange, archiveToggle } = useLeadMutations({
    refetch,
    clearSelection: selection.clear,
  });

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

  const leadExport = useLeadExport();
  function exportCsv(): void {
    void leadExport.start(
      buildLeadExportHref({
        filter,
        sort: sort.effective,
        ownerIds,
        labelKeys,
        nextActivity,
        columns: columns.order,
        condition,
      }),
    );
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
        busy={applying || isRowBusy(row.id)}
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
        exporting={leadExport.exporting}
        exportError={leadExport.error}
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
            applying={applying}
            onClear={selection.clear}
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
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
