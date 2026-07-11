"use client";
import type React from "react";
import { ThreadList } from "@/features/email/ThreadList";
import { trpc } from "@/lib/trpc-client";

const PERSON_EMPTY = "No emails linked to this person yet.";
const PERSON_LOADING = "Loading emails...";
const PERSON_ERROR = "Couldn't load email history. Please try again.";
// Threads link to person_id (and deal_id), never to an organization, so an org has no
// forContact query to feed. State the honest reason instead of a fake placeholder.
const ORG_NOT_APPLICABLE = "Email is tracked on people, not organizations.";

// Person-detail Email tab: threads linked to this person (email.forContact). Visibility is
// enforced server-side by the procedure, so the client renders what it receives. The shared
// ThreadList handles the list (no folder chrome for this linked view); a person-specific empty
// state stands in only when nothing is linked.
export function PersonEmailTab({ personId }: { personId: string }): React.ReactNode {
  const query = trpc.email.forContact.useQuery({ personId });
  // Distinguish loading and error from a genuine empty result: collapsing all three into the
  // empty state made a fetch error read as "no email history" with no retry.
  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">{PERSON_LOADING}</p>;
  }
  if (query.isError) {
    return (
      <p role="alert" className="text-sm text-red-600">
        {PERSON_ERROR}
      </p>
    );
  }
  const threads = query.data ?? [];
  if (threads.length === 0) {
    return <p className="text-sm text-muted-foreground">{PERSON_EMPTY}</p>;
  }
  return <ThreadList folder="linked" threads={threads} />;
}

// Organizations have no linked-thread relation; this replaces the old "Phase 4" placeholder.
export function OrgEmailPanel(): React.ReactNode {
  return <p className="text-sm text-muted-foreground">{ORG_NOT_APPLICABLE}</p>;
}
