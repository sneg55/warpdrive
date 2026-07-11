"use client";
import type React from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import { MultiCombobox } from "@/components/ui/MultiCombobox";

interface Owner {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

interface ParticipantOption {
  id: string;
  name: string;
}

// Owner (-> assigneeId) and Guests/Participants (-> guestPersonIds) selects, split out of
// ActivityComposerInline both to hold that file under the size target AND so the composer can
// place them in separate icon rows (PD puts Guests high, Owner near the bottom). The visible
// text labels are dropped; the leading icon in each ComposerFieldRow conveys the field, and the
// select's ariaLabel keeps it accessible.

export function OwnerField({
  owners,
  ownerId,
  onOwner,
}: {
  owners: Owner[];
  ownerId: string;
  onOwner: (id: string) => void;
}): React.ReactNode {
  return (
    <Combobox
      ariaLabel="Owner"
      value={ownerId}
      onChange={onOwner}
      options={[
        { value: "", label: "Me" },
        ...owners.map<ComboboxOption>((u) => ({
          value: u.id,
          label: u.name,
          avatarName: u.name,
          avatarUrl: u.avatarUrl ?? null,
        })),
      ]}
    />
  );
}

export function GuestsField({
  participantOptions,
  participants,
  onParticipants,
}: {
  participantOptions: ParticipantOption[];
  participants: string[];
  onParticipants: (ids: string[]) => void;
}): React.ReactNode {
  return (
    <MultiCombobox
      ariaLabel="Participants"
      values={participants}
      onChange={onParticipants}
      options={participantOptions.map((p) => ({ value: p.id, label: p.name }))}
      placeholder="Add guests"
    />
  );
}
