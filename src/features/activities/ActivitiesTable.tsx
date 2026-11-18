"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { type ColumnSort, useColumnSort } from "@/components/data-table/useColumnSort";
import { RENDER_WINDOW_STEP, useRenderWindow } from "@/components/data-table/useRenderWindow";
import { useRowSelection } from "@/components/data-table/useRowSelection";
import { useRecordPreview } from "@/features/navigation/recordPreviewStore";
import { useRowCursor } from "@/features/shortcuts/useRowCursor";
import { browserTimeZone } from "@/lib/browserTimeZone";
import { trpc } from "@/lib/trpc-client";
import { ActivitiesFilters } from "./ActivitiesFilters";
import { ActivitiesTableHead } from "./ActivitiesTableHead";
import { ActivityBulkBar } from "./ActivityBulkBar";
import { ActivityEditModal } from "./ActivityEditModal";
import { ActivityRow } from "./ActivityRow";
import { ActivityTableBody } from "./ActivityTableBody";
import { AddActivityModal } from "./AddActivityModal";
import type { ActivityTableRow } from "./activityRows";
import { activityRowTarget } from "./activityRowTarget";
import { followUpLinksOf, useFollowUpAfterDone } from "./followUpAfterDone";
import type { ActivityListFilter, ActivitySortField } from "./schemas";
import { toEditableActivity } from "./toEditableActivity";
import { useActivityBulkActions } from "./useActivityBulkActions";
import { useActivityListFilter } from "./useActivityListFilter";
import { useActivityRowComplete } from "./useActivityRowComplete";

const DEFAULT_SORT: ColumnSort<ActivitySortField> = { field: "dueAtIso", dir: "asc" };

const ACTIVITY_TABLE_COLUMN_COUNT = 12;

interface ActivitiesTableProps {
  currentUserId: string;
  initialFilter?: ActivityListFilter | null;
  pipelineName?: string | null;
}

export function ActivitiesTable({
  currentUserId,
  initialFilter = null,
  pipelineName = null,
}: ActivitiesTableProps): React.ReactNode {
  const { filter, setFilter, ready } = useActivityListFilter(currentUserId, initialFilter);
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<ActivityTableRow | null>(null);
  const selection = useRowSelection();
  const { effective, cycle } = useColumnSort<ActivitySortField>(DEFAULT_SORT);

  const router = useRouter();
  const setPreview = useRecordPreview((s) => s.setPreview);
  const rowsQ = trpc.activities.listRows.useQuery(
    { ...filter, sort: effective, timeZone: browserTimeZone() },
    { enabled: ready },
  );
  const typesQ = trpc.activities.listTypes.useQuery();
  const ownersQ = trpc.identity.assignableUsers.useQuery();
  const { error, progress, bulkMarkDone, bulkDelete } = useActivityBulkActions(selection);
  const promptAfterDone = useFollowUpAfterDone();
  const rows = useMemo(() => rowsQ.data ?? [], [rowsQ.data]);
  const rowComplete = useActivityRowComplete(rows, rowsQ.refetch);
  const rowWindow = useRenderWindow(rows, RENDER_WINDOW_STEP);
  const loadFailed = rowsQ.isError === true && rows.length === 0;
  const loadPending = rowsQ.isPending === true && rows.length === 0;
  const visibleIds = rows.map((r) => r.id);
  const typeIdByKey = useMemo(
    () => new Map((typesQ.data ?? []).map((t) => [t.key, t.id])),
    [typesQ.data],
  );
  const types = useMemo(
    () => (typesQ.data ?? []).map((t) => ({ key: t.key, name: t.name })),
    [typesQ.data],
  );
  const owners = useMemo(
    () =>
      (ownersQ.data ?? []).map((u) => ({
        value: u.id,
        label: u.name,
        avatarName: u.name,
        avatarUrl: u.avatarUrl,
      })),
    [ownersQ.data],
  );

  const groupByDay = effective.field === "dueAtIso";

  const openRow = useCallback(
    (row: ActivityTableRow) => {
      const target = activityRowTarget(row);
      if (target.kind === "edit") {
        setSelected(row);
        return;
      }
      setPreview(target.preview);
      router.push(target.href);
    },
    [router, setPreview],
  );

  const cursor = useRowCursor(rowWindow.visible.length, (i) => {
    const target = rowWindow.visible[i];
    if (target !== undefined) openRow(target);
  });
  const cursorId = cursor === null ? null : (rowWindow.visible[cursor]?.id ?? null);

  function renderRow(r: ActivityTableRow): React.ReactNode {
    return (
      <ActivityRow
        key={r.id}
        row={r}
        selected={selection.isSelected(r.id)}
        onToggleSelect={selection.toggle}
        onToggleDone={(id, currentDone) => void rowComplete.complete(id, currentDone)}
        donePending={rowComplete.isPending(r.id)}
        onRowClick={openRow}
        cursor={r.id === cursorId}
      />
    );
  }

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border bg-card p-0.5 text-sm">
          <span className="rounded-sm bg-accent px-2 py-1 font-medium text-accent-foreground">
            List
          </span>
          <Link
            href="/activities/calendar"
            className="rounded-sm px-2 py-1 text-muted-foreground hover:text-foreground"
          >
            Calendar
          </Link>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="rounded-md bg-action px-3 py-1.5 text-sm font-medium text-action-foreground transition-transform hover:opacity-90 active:scale-[0.96]"
        >
          + Activity
        </button>
        {!loadFailed && !loadPending && (
          <span className="text-sm text-muted-foreground tabular-nums">
            {rows.length} {rows.length === 1 ? "activity" : "activities"}
          </span>
        )}
      </div>

      <div className="mb-3">
        <ActivitiesFilters
          filter={filter}
          onChange={setFilter}
          owners={owners}
          types={types}
          pipelineName={pipelineName}
        />
      </div>

      {selection.count > 0 && (
        <ActivityBulkBar
          count={selection.count}
          progress={progress}
          onClear={selection.clear}
          onMarkDone={() => void bulkMarkDone()}
          onDelete={() => void bulkDelete()}
        />
      )}

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
        <table className="w-full text-sm">
          <ActivitiesTableHead
            effective={effective}
            onSort={cycle}
            allSelected={selection.allSelected(visibleIds)}
            onToggleAll={() => selection.toggleAll(visibleIds)}
          />
          <tbody>
            <ActivityTableBody
              loadFailed={loadFailed}
              loadPending={loadPending}
              rowWindow={rowWindow}
              groupByDay={groupByDay}
              renderRow={renderRow}
              columnCount={ACTIVITY_TABLE_COLUMN_COUNT}
              onRetry={() => void rowsQ.refetch()}
            />
          </tbody>
        </table>
      </div>

      {error !== null && (
        <p role="alert" className="mt-2 self-center text-sm text-red-600">
          {error}
        </p>
      )}

      {modalOpen && <AddActivityModal onClose={() => setModalOpen(false)} />}

      {selected !== null && (
        <ActivityEditModal
          activity={toEditableActivity(selected, typeIdByKey)}
          onClose={() => setSelected(null)}
          onMarkedDone={(activityId) => {
            if (activityId !== selected.id) return;
            if (promptAfterDone(followUpLinksOf(selected))) setSelected(null);
          }}
        />
      )}
    </div>
  );
}
