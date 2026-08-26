"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { BulkActionBar } from "@/components/data-table/BulkActionBar";
import { type ColumnSort, useColumnSort } from "@/components/data-table/useColumnSort";
import { RENDER_WINDOW_STEP, useRenderWindow } from "@/components/data-table/useRenderWindow";
import { useRowSelection } from "@/components/data-table/useRowSelection";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { useRecordPreview } from "@/features/navigation/recordPreviewStore";
import { useRowCursor } from "@/features/shortcuts/useRowCursor";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";
import { ActivitiesFilters } from "./ActivitiesFilters";
import { ActivitiesTableHead } from "./ActivitiesTableHead";
import { ActivityEditModal } from "./ActivityEditModal";
import { ActivityRow } from "./ActivityRow";
import { ActivityTableBody } from "./ActivityTableBody";
import { AddActivityModal } from "./AddActivityModal";
import { completeActivityAction } from "./actions";
import type { ActivityTableRow } from "./activityRows";
import { activityRowTarget } from "./activityRowTarget";
import type { ActivityListFilter, ActivitySortField } from "./schemas";
import { toEditableActivity } from "./toEditableActivity";
import { useActivityBulkActions } from "./useActivityBulkActions";

// Stable module reference: passed as useColumnSort's fallback, so `effective` only changes
// reference when the sort state itself changes (see PeopleList for the same concern).
const DEFAULT_SORT: ColumnSort<ActivitySortField> = { field: "dueAtIso", dir: "asc" };

// Total <th>/<td> columns in the table (select, Done, Subject, Deal, Priority, Contact, Email,
// Phone, Organization, Due, Duration, Assignee): drives the empty-state and day-header colSpans
// so neither has to be kept in sync by hand when a column is added.
const ACTIVITY_TABLE_COLUMN_COUNT = 12;

const DEFAULT_FILTER: ActivityListFilter = {
  ownerId: null,
  done: "open",
  from: null,
  to: null,
  typeKey: null,
};

export function ActivitiesTable(): React.ReactNode {
  const [filter, setFilter] = useState<ActivityListFilter>(DEFAULT_FILTER);
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<ActivityTableRow | null>(null);
  const selection = useRowSelection();
  const { effective, cycle } = useColumnSort<ActivitySortField>(DEFAULT_SORT);

  const router = useRouter();
  const setPreview = useRecordPreview((s) => s.setPreview);
  const reportError = useActionError();
  const rowsQ = trpc.activities.listRows.useQuery({ ...filter, sort: effective });
  const typesQ = trpc.activities.listTypes.useQuery();
  const ownersQ = trpc.identity.assignableUsers.useQuery();
  const { error, bulkMarkDone, bulkDelete } = useActivityBulkActions(selection, rowsQ.refetch);
  const rows = useMemo(() => rowsQ.data ?? [], [rowsQ.data]);
  // Cap how many rows are painted; the count header, select-all, and bulk actions all operate
  // over the full `rows` set, so this bounds render cost only. listRows is pagination-free, so
  // without this the default open-activities view mounts every row at once.
  const rowWindow = useRenderWindow(rows, RENDER_WINDOW_STEP);
  // A transient batched-401 (the F5-1 class) leaves data undefined AND isError=true. Painting that
  // as the empty state makes a recoverable failure look like a genuinely empty to-do list with no
  // way back, so we branch loading/error/empty explicitly (only when we have no rows to fall back
  // on). See ACTIVITIES-01.
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

  // Day-grouping (Pipedrive parity) only makes sense when the effective sort is by due date:
  // grouping a non-date sort (duration/priority/subject) would render the sorted order
  // non-monotonically across day buckets, defeating the sort the user just asked for. So a
  // non-date column sort renders a flat list instead; the default (or explicit dueAtIso) sort
  // keeps the day headers.
  const groupByDay = effective.field === "dueAtIso";

  // A row points at work on a record, so opening it opens that record's drawer: the deal, or the
  // contact the activity hangs off when there is no deal. Seeding the preview first lets the
  // drawer paint a titled skeleton while the server component streams in.
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

  // j/k walks the painted rows, Enter opens the one under the cursor (Pipedrive list parity).
  // Indexed over rowWindow.visible because day grouping preserves that order.
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
        onToggleDone={(id, currentDone) => void complete(id, currentDone)}
        onRowClick={openRow}
        cursor={r.id === cursorId}
      />
    );
  }

  async function complete(id: string, currentDone: boolean): Promise<void> {
    const r = await completeActivityAction({ id, done: !currentDone }, readCsrfToken());
    if (!r.ok) {
      reportError(r.error.id);
      return;
    }
    await rowsQ.refetch();
  }

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {/* View toggle: List (active) vs Calendar. */}
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
        <ActivitiesFilters filter={filter} onChange={setFilter} owners={owners} types={types} />
      </div>

      {selection.count > 0 && (
        <BulkActionBar count={selection.count} onClear={selection.clear}>
          <button
            type="button"
            onClick={() => void bulkMarkDone()}
            className="rounded-md border px-3 py-1 text-sm transition-transform hover:bg-accent active:scale-[0.96]"
          >
            Mark done
          </button>
          <button
            type="button"
            onClick={() => void bulkDelete()}
            className="rounded-md border px-3 py-1 text-sm transition-transform hover:bg-accent active:scale-[0.96]"
          >
            Delete
          </button>
        </BulkActionBar>
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

      {modalOpen && (
        <AddActivityModal
          onClose={() => setModalOpen(false)}
          onCreated={() => void rowsQ.refetch()}
        />
      )}

      {selected !== null && (
        <ActivityEditModal
          activity={toEditableActivity(selected, typeIdByKey)}
          onClose={() => setSelected(null)}
          onSaved={() => void rowsQ.refetch()}
        />
      )}
    </div>
  );
}
