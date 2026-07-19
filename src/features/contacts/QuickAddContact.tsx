"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useId, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/Input";
import { STRINGS } from "@/constants/strings";
import { readCsrfToken } from "@/utils/csrfCookie";
import { createOrgAction, createPersonAction } from "./actions";

const S = STRINGS.contacts;

interface QuickAddContactProps {
  kind: "person" | "org";
  // Optional overrides used by the inbox sidebar's create-and-auto-link flow: relabel the trigger,
  // seed the name/email from the thread's sender, and hand back the new id so the caller can link.
  triggerLabel?: string;
  prefillName?: string;
  prefillEmail?: string;
  onCreated?: (id: string) => void;
}

// "+ Person" / "+ Organization" quick-add (Pipedrive keeps an add button on every
// contact list). A name-only modal wired to the CSRF-guarded create action; on
// success it refreshes so the new row appears. Richer fields live on the detail.
export function QuickAddContact({
  kind,
  triggerLabel,
  prefillName,
  prefillEmail,
  onCreated,
}: QuickAddContactProps): React.ReactNode {
  const router = useRouter();
  const nameId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(prefillName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const label = triggerLabel ?? (kind === "person" ? S.addPerson : S.addOrg);

  function close(): void {
    setOpen(false);
    setName(prefillName ?? "");
    setError(null);
  }

  async function submit(): Promise<void> {
    const trimmed = name.trim();
    if (trimmed === "") return;
    setPending(true);
    setError(null);
    const csrf = readCsrfToken();
    // Seed a primary email from the sender when the caller prefilled one (inbox sidebar create).
    const emails =
      prefillEmail !== undefined && prefillEmail.trim() !== ""
        ? [{ label: "", value: prefillEmail.trim(), primary: true }]
        : [];
    const result =
      kind === "person"
        ? await createPersonAction(
            { name: trimmed, emails, phones: [], orgId: null, customFields: {} },
            csrf,
          )
        : await createOrgAction({ name: trimmed, address: null, customFields: {} }, csrf);
    setPending(false);
    if (!result.ok) {
      setError(result.error.id);
      return;
    }
    close();
    // When the caller wants the new id (create-and-auto-link), hand it back and let them drive the
    // follow-up (e.g. link the thread + refetch). Otherwise fall back to the list refresh.
    if (onCreated !== undefined) {
      onCreated(result.value.id);
    } else {
      router.refresh();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-action px-3 py-1.5 text-sm font-medium text-action-foreground hover:bg-action/90 active:scale-[0.96] transition-transform"
      >
        {label}
      </button>

      {open && (
        <Dialog
          open
          onOpenChange={(o) => {
            if (!o) close();
          }}
        >
          <DialogContent aria-describedby={undefined} className="max-w-sm gap-0 bg-card p-4">
            <DialogHeader className="sr-only">
              <DialogTitle>{label}</DialogTitle>
            </DialogHeader>
            <label htmlFor={nameId} className="mb-1 block text-sm font-medium">
              {S.nameLabel}
            </label>
            <Input
              id={nameId}
              required
              maxLength={255}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
            />
            {error !== null && <p className="mt-2 text-xs text-destructive">{error}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className="rounded px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground active:scale-[0.96] transition-transform"
              >
                {S.cancel}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => void submit()}
                className="rounded-md bg-action px-3 py-1.5 text-sm font-medium text-action-foreground hover:bg-action/90 disabled:opacity-50 active:not-disabled:scale-[0.96] transition-transform"
              >
                {S.add}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
