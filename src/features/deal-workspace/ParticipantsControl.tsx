"use client";
import { Plus } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { ParticipantsDialog } from "./ParticipantsDialog";
import { useParticipants } from "./useParticipants";

// Summary-row participants trigger (Pipedrive parity): "+ Participants" while the deal has none,
// then an "N participants" count-link. Either opens the participants table dialog.
export function ParticipantsControl({
  dealId,
  person,
  orgId,
  orgName,
}: {
  dealId: string;
  person: { id: string; name: string } | null;
  orgId: string | null;
  orgName: string | null;
}): React.ReactNode {
  const [open, setOpen] = useState(false);
  const data = useParticipants(dealId, person, orgId);
  const count = data.participants.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-0.5 text-sm font-semibold text-primary hover:underline"
      >
        {count === 0 ? (
          <>
            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
            Participants
          </>
        ) : (
          `${count} participant${count === 1 ? "" : "s"}`
        )}
      </button>
      <ParticipantsDialog
        open={open}
        onOpenChange={setOpen}
        title={orgName ?? "this deal"}
        data={data}
      />
    </>
  );
}
