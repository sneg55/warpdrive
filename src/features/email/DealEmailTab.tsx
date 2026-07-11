"use client";
import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { ThreadList } from "./ThreadList";
import { ThreadPane } from "./ThreadPane";

// Deal-workspace Email tab: threads linked to this deal (email.forDeal). Visibility is already
// enforced server-side by the procedure, so the client just renders what it receives. Loading and
// error are kept distinct from "empty": a fetch that is still in flight or that failed must NOT read
// as "no emails" (data is undefined in both states). The empty state stands in only once the query
// has loaded with zero linked threads.
//
// A2: selecting a thread reads it INLINE (ThreadPane) with a back control, instead of navigating to
// /inbox/[id] and leaving the deal (Pipedrive reads linked mail in place).
export function DealEmailTab({ dealId }: { dealId: string }): React.ReactNode {
  const query = trpc.email.forDeal.useQuery({ dealId });
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);

  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading emails...</p>;
  }
  if (query.isError) {
    return <p className="text-sm text-red-600">Couldn't load emails. Please try again.</p>;
  }
  const threads = query.data ?? [];
  if (threads.length === 0) {
    return <p className="text-sm text-muted-foreground">No emails linked to this deal yet.</p>;
  }

  if (openThreadId !== null) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setOpenThreadId(null)}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" fill="none" />
          </svg>
          Back to emails
        </button>
        <ThreadPane threadId={openThreadId} trackingBadge={null} />
      </div>
    );
  }

  return <ThreadList folder="linked" threads={threads} onSelect={setOpenThreadId} />;
}
