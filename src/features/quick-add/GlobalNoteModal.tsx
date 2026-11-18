"use client";
import type React from "react";
import { useMemo, useState } from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ComposeNoteTab } from "@/features/compose/ComposeNoteTab";
import { trpc } from "@/lib/trpc-client";

export function GlobalNoteModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}): React.ReactNode {
  const [personId, setPersonId] = useState("");
  const peopleQ = trpc.contacts.personOptions.useQuery(undefined, { retry: false });
  const options = useMemo<ComboboxOption[]>(
    () => (peopleQ.data ?? []).map((p) => ({ value: p.id, label: p.name, avatarName: p.name })),
    [peopleQ.data],
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New note</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Combobox
            value={personId}
            onChange={setPersonId}
            options={options}
            ariaLabel="Note target person"
            placeholder="Select a person"
          />
          {personId !== "" && (
            <ComposeNoteTab
              entityType="person"
              entityId={personId}
              onNoteCreated={() => {
                onCreated();
                onClose();
              }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
