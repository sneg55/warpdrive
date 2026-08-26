"use client";
import type React from "react";

// The inbox's paging affordance, rendered only while pages remain.
export function LeadsLoadMore({ onClick }: { onClick: () => void }): React.ReactNode {
  return (
    <div className="mt-3 flex justify-center">
      <button
        type="button"
        onClick={onClick}
        className="rounded-md border px-4 py-1.5 text-sm font-medium transition-[background-color,scale] duration-150 ease-out hover:bg-accent active:scale-[0.96] motion-reduce:transition-colors"
      >
        Load more
      </button>
    </div>
  );
}
