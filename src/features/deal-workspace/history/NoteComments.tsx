"use client";
import { MessageSquare } from "lucide-react";
import type React from "react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import type { CommentableEntityType } from "@/constants/comments";
import { createCommentAction } from "@/features/collaboration/commentActions";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";
import { CommentCard } from "./CommentCard";

interface Props {
  noteId: string;
  entityType: CommentableEntityType;
  entityId: string;
  onError?: (errorId: string) => void;
}

export function NoteComments({ noteId, entityType, entityId, onError }: Props): React.ReactNode {
  const utils = trpc.useUtils();
  const query = trpc.collaboration.listComments.useQuery({ entityType, entityId });
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const refetch = useCallback(() => {
    void utils.collaboration.listComments.invalidate({ entityType, entityId });
  }, [utils, entityType, entityId]);

  const post = useCallback(async () => {
    const trimmed = draft.trim();
    if (trimmed === "" || busy) return;
    setBusy(true);
    const res = await createCommentAction({ noteId, body: trimmed }, readCsrfToken());
    setBusy(false);
    if (res.ok) {
      setDraft("");
      setComposing(false);
      refetch();
    } else {
      onError?.(res.error.id);
    }
  }, [draft, busy, noteId, refetch, onError]);

  const mine = (query.data ?? []).filter((c) => c.noteId === noteId);

  return (
    <div className="mt-2 border-t border-border/60 pt-2">
      {mine.length > 0 && (
        <ul className="mb-1 space-y-1 border-l-2 border-border/70 pl-3">
          {mine.map((c) => (
            <li key={c.id}>
              <CommentCard
                id={c.id}
                body={c.body}
                createdAt={new Date(c.createdAt)}
                actorName={c.actorName}
                canModify={c.canModify}
                onChanged={refetch}
                onError={onError}
              />
            </li>
          ))}
        </ul>
      )}

      {composing ? (
        <div>
          <Textarea
            aria-label="Comment"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="Write a comment..."
            className="resize-y bg-card"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setDraft("");
                setComposing(false);
              }}
            >
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void post()}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="flex items-center gap-1.5 rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <MessageSquare aria-hidden="true" className="h-3.5 w-3.5" />
          Comment
        </button>
      )}
    </div>
  );
}
