"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useId, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createOrgAction, createPersonAction } from "@/features/contacts/actions";
import {
  AddressFields,
  type ContactPoint,
  cleanAddress,
  nonEmptyPoints,
  PersonBaseFields,
} from "@/features/contacts/EditContactForms";
import { useInterfacePrefs } from "@/features/identity/InterfacePrefsProvider";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";

// Controlled rich-create modal for Person / Organization, usable from the global "+" menu.
// Reuses the same field components as Edit contact so intake captures phone/email/org (person)
// and address (org) in one step (M1 parity), instead of the old name-only create-then-edit flow.
// Owner + Labels are intentionally omitted: owner is server-derived (creator) and per-contact
// labels have no data model yet, so both remain open decisions rather than rich-create fields.
export function GlobalContactModal({
  kind,
  onClose,
  onCreated,
}: {
  kind: "person" | "org";
  onClose: () => void;
  onCreated: () => void;
}): React.ReactNode {
  const router = useRouter();
  const { openDetailsAfterCreate } = useInterfacePrefs();
  const nameId = useId();
  const [name, setName] = useState("");
  const [emails, setEmails] = useState<ContactPoint[]>([]);
  const [phones, setPhones] = useState<ContactPoint[]>([]);
  const [orgId, setOrgId] = useState("");
  const [address, setAddress] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const label = kind === "person" ? "New person" : "New organization";

  // Org options for the person's org assignment (mirrors EditContactModal); skipped for org create.
  const orgQ = trpc.contacts.orgOptions.useQuery(undefined, { enabled: kind === "person" });
  const orgOptions = orgQ.data ?? [];

  async function submit(): Promise<void> {
    const trimmed = name.trim();
    if (trimmed === "") {
      setError("Name is required");
      return;
    }
    setPending(true);
    setError(null);
    const csrf = readCsrfToken();
    const result =
      kind === "person"
        ? await createPersonAction(
            {
              name: trimmed,
              emails: nonEmptyPoints(emails),
              phones: nonEmptyPoints(phones),
              orgId: orgId === "" ? null : orgId,
              customFields: {},
            },
            csrf,
          )
        : await createOrgAction(
            { name: trimmed, address: cleanAddress(address), customFields: {} },
            csrf,
          );
    setPending(false);
    if (!result.ok) {
      setError(result.error.id);
      return;
    }
    onCreated();
    onClose();
    // "Open details view after creating a new item" (personal preference): navigate to the new
    // record when the matching per-entity flag is on, otherwise just refresh the current list.
    const openDetails =
      kind === "person" ? openDetailsAfterCreate.person : openDetailsAfterCreate.org;
    if (openDetails) {
      const path = kind === "person" ? "people" : "orgs";
      router.push(`/contacts/${path}/${result.value.id}`);
    } else {
      router.refresh();
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent aria-describedby={undefined} className="max-w-sm gap-0 bg-card p-4">
        <DialogHeader className="mb-3">
          <DialogTitle className="text-base font-semibold">{label}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor={nameId} className="block text-sm font-medium">
              Name
            </label>
            <input
              id={nameId}
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
              className="w-full rounded border px-2 py-1 text-sm"
            />
          </div>
          {kind === "person" ? (
            <PersonBaseFields
              emails={emails}
              phones={phones}
              orgId={orgId}
              orgOptions={orgOptions}
              onEmails={setEmails}
              onPhones={setPhones}
              onOrgId={setOrgId}
            />
          ) : (
            <AddressFields value={address} onChange={setAddress} />
          )}
        </div>
        {error !== null && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => void submit()}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {pending ? "Adding..." : "Add"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
