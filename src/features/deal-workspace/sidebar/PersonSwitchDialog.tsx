"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/Input";
import { STRINGS } from "@/constants/strings";
import { trpc } from "@/lib/trpc-client";

export function PersonSwitchDialog({
  open,
  currentPersonId,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  currentPersonId: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (personId: string) => Promise<void>;
}) {
  const [personId, setPersonId] = useState(currentPersonId ?? "");
  const [pending, setPending] = useState(false);
  const peopleQ = trpc.contacts.personOptions.useQuery(undefined, { enabled: open });
  const people = peopleQ.data;
  const options: ComboboxOption[] = (people ?? []).map((person) => ({
    value: person.id,
    label: person.name,
    avatarName: person.name,
  }));
  const strings = STRINGS.dealSidebar.personDialog;

  const dirty = personId !== "" && personId !== currentPersonId;

  async function save(): Promise<void> {
    if (!dirty) return;
    setPending(true);
    await onSave(personId);
    setPending(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setPersonId(currentPersonId ?? "");
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{strings.title}</DialogTitle>
        </DialogHeader>
        {people === undefined ? (
          <Input aria-label={strings.person} placeholder={strings.person} disabled readOnly />
        ) : (
          <Combobox
            ariaLabel={strings.person}
            value={personId}
            options={options}
            onChange={setPersonId}
            placeholder={strings.person}
          />
        )}
        {peopleQ.isError === true && (
          <p role="alert" className="text-xs text-destructive">
            {strings.loadFailed}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {strings.cancel}
          </Button>
          <Button onClick={() => void save()} disabled={pending || !dirty}>
            {strings.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
