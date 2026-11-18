import type React from "react";
import { Skeleton } from "@/components/ui/Skeleton";

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

function RowsSkeleton({ rows = 8 }: { rows?: number }): React.ReactNode {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  );
}

export function ListSectionSkeleton(): React.ReactNode {
  return (
    <div className="flex flex-col gap-4" role="status" aria-busy="true" aria-label="Loading">
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
        <div className="flex w-full flex-col gap-3 lg:w-72">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
        <div className="flex flex-1 flex-col gap-3">
          <Skeleton className="h-10 w-64" />
          <RowsSkeleton rows={6} />
        </div>
      </div>
    </main>
  );
}

export function DetailDrawerSkeleton({
  header,
}: {
  header?: React.ReactNode;
} = {}): React.ReactNode {
  return (
    <div className="flex flex-col gap-4" role="status" aria-busy="true" aria-label="Loading">
      {header ?? <Skeleton className="h-7 w-64" />}
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
        <div className="flex w-80 shrink-0 flex-col gap-2">
          <RowsSkeleton rows={7} />
        </div>
        <div className="flex-1">
          <Skeleton className="h-full min-h-64 w-full" />
        </div>
      </div>
    </main>
  );
}

export function ThreadRowsSkeleton({ rows = 6 }: { rows?: number } = {}): React.ReactNode {
  return (
    <li>
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading conversations"
        className="flex flex-col gap-3 p-3"
      >
        {Array.from({ length: rows }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
          <div key={i} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton className="h-3.5 w-56" />
          </div>
        ))}
      </div>
    </li>
  );
}

export function SearchResultsSkeleton(): React.ReactNode {
  return (
    <div role="status" aria-busy="true" aria-label="Searching" className="py-1">
      {Array.from({ length: 4 }, (_, section) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder sections
        <div key={section} className="px-3 py-1">
          <Skeleton className="my-1 h-3 w-20" />
          <Skeleton className="my-2 h-4 w-full" />
          <Skeleton className="my-2 h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}

export function TableRowsSkeleton({
  columnCount,
  rows = 6,
  label,
}: {
  columnCount: number;
  rows?: number;
  label: string;
}): React.ReactNode {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
        <tr key={i}>
          <td colSpan={columnCount} className="px-3 py-2.5">
            {i === 0 ? (
              <div role="status" aria-busy="true" aria-label={label}>
                <Skeleton className="h-5 w-full" />
              </div>
            ) : (
              <Skeleton className="h-5 w-full" />
            )}
          </td>
        </tr>
      ))}
    </>
  );
}

export function EngagementGridSkeleton({ lanes = 6 }: { lanes?: number } = {}): React.ReactNode {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading engagement timeline"
      className="rounded-lg border bg-card p-3 shadow-sm"
    >
      <div className="mb-3 flex gap-3">
        <Skeleton className="h-4 w-[220px] shrink-0" />
        <Skeleton className="h-4 flex-1" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: lanes }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder lanes
          <div key={i} className="flex gap-3">
            <Skeleton className="h-6 w-[220px] shrink-0" />
            <Skeleton className="h-6 flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton(): React.ReactNode {
  return (
    <main className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <HeadingSkeleton action={false} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder tiles
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </main>
  );
}
