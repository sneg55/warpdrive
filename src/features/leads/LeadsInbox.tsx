"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { DEFAULT_BASE_CURRENCY } from "@/constants/currency";
import { STRINGS } from "@/constants/strings";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";
import { BulkEditPanel } from "./inbox/BulkEditPanel";
import { convertErrorMessage } from "./inbox/convertErrorMessage";
import { buildLeadExportHref } from "./inbox/exportHref";
import { LeadFilterBuilder } from "./inbox/LeadFilterBuilder";
import type { OwnerFilter } from "./inbox/LeadFilters";
import { LeadRowActions } from "./inbox/LeadRowActions";
import { LeadsActionBar } from "./inbox/LeadsActionBar";
import { LeadsTable } from "./inbox/LeadsTable";
import { useLeadColumns } from "./inbox/useLeadColumns";
import { useLeadList } from "./inbox/useLeadList";
import { useLeadSelection } from "./inbox/useLeadSelection";
import { type LeadSort, useLeadSort } from "./inbox/useLeadSort";
import { useLeadsViewPersist } from "./inbox/useLeadsViewPersist";
import type { LeadRow } from "./leadRepo";
import {
  archiveLeadAction,
  bulkConvertLeadsAction,
  bulkUpdateLeadsAction,
  convertLeadAction,
} from "./leadServerActions";
import type { BulkUpdateLeadsInput, LeadConditionInput, LeadNextActivityBucket } from "./schemas";

type Filter = "inbox" | "archived";

export interface LeadsInboxProps {
  baseCurrency?: string;
  // Seeded from user_preferences.ui.leadsView (server); falls back to columns.ts defaults.
  initialView?: { columns: string[]; sort: LeadSort } | null;
  // Whether the actor holds data.import; gates the action bar's "Import leads" link.
  canImport?: boolean;
}

export function LeadsInbox({
  baseCurrency,
  initialView,
  canImport = false,
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
  const [convertError, setConvertError] = useState<string | null>(null);

  const sort = useLeadSort(initialView?.sort ?? null);
  const selection = useLeadSelection();
  const columns = useLeadColumns(initialView?.columns);

  // Ungated: every user gets the full active-user list so owner filtering runs server-side by id.
  const usersQ = trpc.identity.assignableUsers.useQuery(undefined, { retry: false });
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

  const bulkConverting = useRef(false);
  const [bulkConvertPending, setBulkConvertPending] = useState(false);
  async function bulkConvert(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    // In-flight guard: a rapid double-click must not fire two overlapping batches (mirrors
    // convertRow's converting ref for the single-lead button).
    if (bulkConverting.current) return;
    bulkConverting.current = true;
    setBulkConvertPending(true);
    setConvertError(null);
    try {
      const r = await bulkConvertLeadsAction({ ids }, readCsrfToken());
      if (r.ok) {
        selection.clear();
        await refetch();
      } else {
        // Systemic failure (e.g. PERM_DENIED, no resolvable pipeline): surface it like convertRow
        // does and do NOT clear the selection or refetch as if the batch had succeeded.
        setConvertError(convertErrorMessage(r.error.id));
      }
    } finally {
      bulkConverting.current = false;
      setBulkConvertPending(false);
    }
  }

  async function archiveToggle(id: string, archived: boolean): Promise<void> {
    const r = await archiveLeadAction({ leadId: id, archived }, readCsrfToken());
    if (r.ok) await refetch();
    else reportError(r.error.id);
  }

  const converting = useRef(false);
  async function convertRow(row: LeadRow): Promise<void> {
    // In-flight guard: a rapid double-click must not fire two convert calls (the second would
    // race to a confusing "already converted"/stale-CAS banner even though the first succeeded).
    if (converting.current) return;
    converting.current = true;
    setConvertError(null);
    try {
      const r = await convertLeadAction(
        { leadId: row.id, expectedUpdatedAt: row.updatedAt.toISOString() },
        readCsrfToken(),
      );
      if (r.ok) {
        router.push(`/deals/${r.value.dealId}`);
        return;
      }
      // Stale CAS / already-converted / permission denied: show copy and refetch so the row
      // reflects the current server state (e.g. it now renders as "Converted").
      setConvertError(convertErrorMessage(r.error.id));
      await refetch();
    } finally {
      converting.current = false;
    }
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
  const emptyLabel = archived ? "No archived leads." : "No leads yet. Add your first lead.";

  function renderRowActions(row: LeadRow): React.ReactNode {
    return (
      <LeadRowActions
        archived={row.archivedAt !== null}
        converted={row.convertedDealId !== null}
        assignableUsers={users}
        onOpen={() => router.push(`/leads/${row.id}`)}
        onConvert={() => void convertRow(row)}
        onArchiveToggle={() => void archiveToggle(row.id, row.archivedAt === null)}
        onDelete={() => void bulkChange([row.id], { deleted: true })}
        onChangeOwner={(ownerId) => void bulkChange([row.id], { ownerId })}
      />
    );
  }

  return (
    <div className="flex h-full flex-col p-4">
      <h1 className="mb-3 text-lg font-semibold">{STRINGS.nav.leads}</h1>
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
        order={columns.order}
        visibleKeys={columns.visibleKeys}
        onToggleColumn={columns.toggle}
        onReorderColumn={columns.reorder}
        onExport={exportCsv}
        filterBuilder={
          <LeadFilterBuilder
            users={users}
            activeCount={condition?.conditions.length ?? 0}
            onApply={setCondition}
          />
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
            onConvert={() => void bulkConvert([...selection.selected])}
            converting={bulkConvertPending}
            onClear={selection.clear}
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
        <LeadsTable
          rows={rows}
          columns={columns.visibleColumns}
          now={now}
          currency={currency}
          emptyLabel={emptyLabel}
          sort={sort.effective}
          onSort={sort.cycle}
          isSelected={selection.isSelected}
          allSelected={selection.allSelected(visibleIds)}
          onToggleRow={selection.toggle}
          onToggleAll={() => selection.toggleAll(visibleIds)}
          onOpen={(id) => router.push(`/leads/${id}`)}
          renderRowActions={renderRowActions}
        />
      </div>

      {list.canLoadMore && (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={list.loadMore}
            className="rounded-md border px-4 py-1.5 text-sm font-medium transition hover:bg-accent active:scale-[0.96]"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
