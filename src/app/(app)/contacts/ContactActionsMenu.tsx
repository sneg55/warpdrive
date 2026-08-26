"use client";
import { EllipsisVertical } from "lucide-react";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ICON_BUTTON } from "@/constants/formStyles";
import { deleteOrgAction, deletePersonAction } from "@/features/contacts/actions";
import { readCsrfToken } from "@/utils/csrfCookie";

interface ContactActionsMenuProps {
  entityType: "person" | "organization";
  entityId: string;
  canMerge: boolean;
  canDelete: boolean;
  // Opens the existing MergeDialog owned by the detail client (kept there so this menu stays a
  // trigger, not a second dialog host).
  onMerge: () => void;
}

// Header overflow (ellipsis) menu for a person/org detail (Pipedrive parity, CO-3): Copy link,
// Merge duplicates (permission-gated), Delete (permission-gated). Each item is backed by a real
// action; delete confirms via the shadcn ConfirmDialog, then routes back to the list.
export function ContactActionsMenu({
  entityType,
  entityId,
  canMerge,
  canDelete,
  onMerge,
}: ContactActionsMenuProps): React.ReactNode {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const basePath = entityType === "person" ? "/contacts/people" : "/contacts/orgs";

  async function copyLink(): Promise<void> {
    await navigator.clipboard.writeText(`${location.origin}${basePath}/${entityId}`);
  }

  async function remove(): Promise<void> {
    setPending(true);
    const r =
      entityType === "person"
        ? await deletePersonAction({ id: entityId }, readCsrfToken())
        : await deleteOrgAction({ id: entityId }, readCsrfToken());
    setPending(false);
    if (r.ok) router.push(basePath);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Contact actions" disabled={pending} className={ICON_BUTTON}>
        <EllipsisVertical aria-hidden="true" className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem onSelect={() => void copyLink()}>Copy link</DropdownMenuItem>
        {canMerge && <DropdownMenuItem onSelect={onMerge}>Merge duplicates</DropdownMenuItem>}
        {canDelete && (
          <DropdownMenuItem onSelect={() => setConfirmingDelete(true)} className="text-destructive">
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>

      {/* Sibling of the menu content, not a child of it: the menu unmounts its items on select,
          which would take the dialog with it. */}
      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Delete this record?"
        description="This cannot be undone."
        confirmLabel="Delete"
        destructive
        pending={pending}
        onConfirm={() => void remove()}
      />
    </DropdownMenu>
  );
}
