"use client";
import { Plus, User } from "lucide-react";
import Link from "next/link";
import type React from "react";
import { useState } from "react";
import { CollapsibleSection } from "../CollapsibleSection";
import { ParticipantsDialog } from "../ParticipantsDialog";
import { useParticipants } from "../useParticipants";

// Sidebar Participants section (Pipedrive parity): person-link rows, a header "+" quick-add, and
// a "View All" button, both opening the participants table dialog. Matching PD's zero-state, the
// section renders nothing while the deal has no participants (the Summary "+ Participants" CTA
// is the entry point).
export function ParticipantsSection({
  title,
  dealId,
  person,
  orgId,
  orgName,
}: {
  title: string;
  dealId: string;
  person: { id: string; name: string } | null;
  orgId: string | null;
  orgName: string | null;
}): React.ReactNode {
  const [open, setOpen] = useState(false);
  const data = useParticipants(dealId, person, orgId);
  if (data.participants.length === 0) return null;

  return (
    <CollapsibleSection
      title={title}
      showFilter={false}
      headerActions={() => (
        <button
          type="button"
          aria-label="Add participant"
          onClick={() => setOpen(true)}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
    >
      <ul className="space-y-1.5 py-1">
        {data.participants.map((p) => (
          <li key={p.personId} className="flex items-center gap-2 text-sm">
            <User aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <Link
              href={`/contacts/people/${p.personId}`}
              className="min-w-0 truncate font-semibold text-primary hover:underline"
            >
              {p.name}
            </Link>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 rounded-md border px-2.5 py-1 text-sm transition-[background-color,scale] duration-150 ease-out hover:bg-accent active:scale-[0.96]"
      >
        View All
      </button>
      <ParticipantsDialog
        open={open}
        onOpenChange={setOpen}
        title={orgName ?? "this deal"}
        data={data}
      />
    </CollapsibleSection>
  );
}
