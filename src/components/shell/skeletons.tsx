import type React from "react";
import { Skeleton } from "@/components/ui/Skeleton";

// Shared loading skeletons rendered by route loading.tsx files. Each mirrors the real page's
// header + content shape closely enough that when the server render swaps in, nothing jumps.
// These exist so a navigation paints instantly (a Suspense fallback) instead of freezing on the
// old page until the server finishes its data fetch. Presentational only, no data.

// Page heading placeholder: a breadcrumb line, a title, and a right-aligned action button, matching
// the shared PageHeading layout.
function HeadingSkeleton({ action = true }: { action?: boolean }): React.ReactNode {
  return (
    <div className="mb-4">
      <Skeleton className="mb-2 h-4 w-40" />
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-7 w-56" />
        {action ? <Skeleton className="h-9 w-32" /> : null}
      </div>
    </div>
  );
}

// A block of table-like rows for list pages (people, orgs, leads, activities, pipeline list).
function RowsSkeleton({ rows = 8 }: { rows?: number }): React.ReactNode {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, i) => (
        // Static skeleton list: index keys are correct (no reordering, no identity).
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  );
}

// Just the data region of a list page (toolbar + table rows), no heading. Used as the inner
// <Suspense> fallback on list pages whose static heading renders immediately while the rows stream.
export function ListSectionSkeleton(): React.ReactNode {
  return (
    <div className="flex flex-col gap-4" role="status" aria-busy="true" aria-label="Loading">
      {/* Toolbar row (filter / view controls) above the table. */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-28" />
      </div>
      <RowsSkeleton />
    </div>
  );
}

export function ListPageSkeleton(): React.ReactNode {
  return (
    <main className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <HeadingSkeleton />
      <ListSectionSkeleton />
    </main>
  );
}

export function BoardSkeleton(): React.ReactNode {
  return (
    <main className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <HeadingSkeleton />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 5 }, (_, col) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder columns
          <div key={col} className="flex w-64 shrink-0 flex-col gap-2">
            <Skeleton className="h-8 w-full" />
            {Array.from({ length: 4 }, (_, card) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder cards
              <Skeleton key={card} className="h-24 w-full" />
            ))}
          </div>
        ))}
      </div>
    </main>
  );
}

export function DetailPageSkeleton(): React.ReactNode {
  return (
    <main className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <HeadingSkeleton />
      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Left sidebar (record fields / firmographics). */}
        <div className="flex w-full flex-col gap-3 lg:w-72">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
        {/* Main content column (timeline / tabs). */}
        <div className="flex flex-1 flex-col gap-3">
          <Skeleton className="h-10 w-64" />
          <RowsSkeleton rows={6} />
        </div>
      </div>
    </main>
  );
}

// Content of the record slide-over (DetailDrawer), used as the inner <Suspense> fallback on the
// intercepted person/org/lead routes. The drawer shell renders instantly and stays mounted; only
// this content region streams, so the drawer never re-animates.
export function DetailDrawerSkeleton(): React.ReactNode {
  return (
    <div className="flex flex-col gap-4" role="status" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-7 w-64" />
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex w-full flex-col gap-3 lg:w-72">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
        <div className="flex flex-1 flex-col gap-3">
          <Skeleton className="h-10 w-64" />
          <RowsSkeleton rows={6} />
        </div>
      </div>
    </div>
  );
}

export function InboxSkeleton(): React.ReactNode {
  return (
    <main className="flex h-full flex-col gap-4" aria-busy="true" aria-label="Loading">
      <HeadingSkeleton action={false} />
      <div className="flex flex-1 gap-4">
        {/* Thread list column. */}
        <div className="flex w-80 shrink-0 flex-col gap-2">
          <RowsSkeleton rows={7} />
        </div>
        {/* Reading pane. */}
        <div className="flex-1">
          <Skeleton className="h-full min-h-64 w-full" />
        </div>
      </div>
    </main>
  );
}

export function DashboardSkeleton(): React.ReactNode {
  return (
    <main className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <HeadingSkeleton action={false} />
      {/* Stat tiles row. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder tiles
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      {/* Chart blocks. */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </main>
  );
}
