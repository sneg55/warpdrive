"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { changeOwnerAction } from "@/features/deal-workspace/actions";
import { useDealActionError } from "@/features/deal-workspace/DealActionErrorProvider";
import { formatUserName } from "@/features/identity/formatUserName";
import { readCsrfToken } from "@/utils/csrfCookie";

interface OwnerBlockProps {
  dealId: string;
  // CAS precondition: the deal's updatedAt ISO string.
  expectedUpdatedAt: string;
  owner: { id: string; name: string; avatarUrl: string | null } | null;
  // Only actors holding deal.changeOwner see the reassignment trigger (gated server-side too).
  canChangeOwner: boolean;
  assignableUsers: { id: string; name: string }[];
}

// Owner avatar + name + "Owner" caption (Pipedrive parity). The name is plain text (no profile
// route). When the actor may change owner, a chevron opens a UserMenu-style dropdown of assignable
// users; selecting one reassigns via changeOwnerAction and refreshes.
export function OwnerBlock({
  dealId,
  expectedUpdatedAt,
  owner,
  canChangeOwner,
  assignableUsers,
}: OwnerBlockProps): React.ReactNode {
  const router = useRouter();
  const reportError = useDealActionError();
  const [pending, setPending] = useState(false);

  // Humanize the owner name (an email-shaped name renders as a display name) and map
  // an empty/absent name to "Unassigned", mirroring OwnerBadge. Never leak a raw email.
  const name = formatUserName(owner?.name ?? "");

  async function reassign(userId: string): Promise<void> {
    if (userId === owner?.id || pending) return;
    setPending(true);
    const r = await changeOwnerAction(
      { dealId, ownerId: userId, expectedUpdatedAt },
      readCsrfToken(),
    );
    setPending(false);
    if (r.ok) router.refresh();
    else reportError(r.error.id);
  }

  return (
    <div className="flex items-center gap-2">
      <Avatar name={name} src={owner?.avatarUrl ?? null} />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-medium text-foreground">{name}</p>
        <p className="text-xs text-muted-foreground">Owner</p>
      </div>
      {canChangeOwner && (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Change owner"
            disabled={pending}
            className="relative rounded p-0.5 text-muted-foreground transition-[color,scale] duration-150 ease-out after:absolute after:-inset-2 after:content-[''] hover:text-foreground active:not-disabled:scale-[0.96] disabled:opacity-50"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
              <path d="M7 10l5 5 5-5z" />
            </svg>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" aria-label="Assign owner" className="min-w-44">
            {assignableUsers.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">No assignable users</p>
            ) : (
              assignableUsers.map((u) => (
                <DropdownMenuItem key={u.id} onSelect={() => void reassign(u.id)}>
                  {u.name}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
