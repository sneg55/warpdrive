"use client";
import { Ellipsis } from "lucide-react";
import type React from "react";
import { useCallback, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/Textarea";
import { deleteCommentAction, updateCommentAction } from "@/features/collaboration/commentActions";
import { LinkifiedText } from "@/features/collaboration/LinkifiedText";
import { readCsrfToken } from "@/utils/csrfCookie";
import { AttributionLine } from "./AttributionLine";

export interface CommentRowProps {
  id: string;
  body: string;
  createdAt: Date;
  actorName: string | null;
  canModify: boolean;
  onChanged: () => void;
  onError?: (errorId: string) => void;
}

export function CommentCard({
  id,
  body,
  createdAt,
  actorName,
  canModify,
  onChanged,
  onError,
}: CommentRowProps): React.ReactNode {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const startEditing = useCallback(() => {
    setDraft(body);
    setEditing(true);
  }, [body]);

  const save = useCallback(async () => {
    const trimmed = draft.trim();
    if (trimmed === "" || busy) return;
    setBusy(true);
    const res = await updateCommentAction({ commentId: id, body: trimmed }, readCsrfToken());
    setBusy(false);
    if (res.ok) {
      setEditing(false);
      onChanged();
    } else {
      onError?.(res.error.id);
    }
  }, [draft, busy, id, onChanged, onError]);

  const remove = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const res = await deleteCommentAction({ commentId: id }, readCsrfToken());
    setBusy(false);
    if (res.ok) {
      setConfirmOpen(false);
      onChanged();
    } else {
      onError?.(res.error.id);
    }
  }, [busy, id, onChanged, onError]);

  if (editing) {
    return (
      <div className="py-1">
        <Textarea
          aria-label="Comment"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          className="resize-y bg-card"
        />
        <div className="mt-2 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setDraft(body);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void save()}>
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 py-1">
      <div className="min-w-0 flex-1">
        <p className="whitespace-pre-wrap text-pretty text-sm text-foreground">
          <LinkifiedText text={body} />
        </p>
        <AttributionLine at={createdAt} actorName={actorName} />
      </div>
      {canModify && (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Comment actions"
            className="relative shrink-0 rounded p-1 text-muted-foreground after:absolute after:-inset-2 after:content-[''] hover:bg-accent hover:text-foreground"
          >
            <Ellipsis aria-hidden="true" className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" aria-label="Comment actions" className="min-w-40">
            <DropdownMenuItem onSelect={startEditing}>Edit</DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => setConfirmOpen(true)}
              className="text-destructive focus:text-destructive"
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete comment?"
        description="This action cannot be undone."
        confirmLabel="Delete comment"
        destructive
        pending={busy}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
