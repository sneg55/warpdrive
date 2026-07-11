"use client";

import { useState } from "react";
import { STRINGS } from "@/constants/strings";
import { Composer } from "./composer/Composer";
import { buildReplyPrefill, type ReplyMode, type ReplyPrefillSourceMessage } from "./replyPrefill";

interface ReaderActionsProps {
  message: ReplyPrefillSourceMessage;
  // Mailbox address the reply/forward is sent from; excluded from reply-all recipients.
  selfEmail: string;
  accountId: string;
  threadId: string;
  onSent?: () => void;
}

// Reply / Reply all / Forward for the thread reader. Toggles which mode is active; the
// active mode renders the shared Composer pre-filled via buildReplyPrefill (pure
// recipient/subject/body derivation, unit-tested separately in replyPrefill.test.ts).
// Forward omits threadId so sending forks a new thread instead of replying into this one.
export function ReaderActions({
  message,
  selfEmail,
  accountId,
  threadId,
  onSent,
}: ReaderActionsProps): React.ReactNode {
  const [mode, setMode] = useState<ReplyMode | null>(null);

  if (mode !== null) {
    return (
      <Composer
        accountId={accountId}
        threadId={mode === "forward" ? undefined : threadId}
        prefill={buildReplyPrefill(mode, message, selfEmail)}
        onSent={onSent}
        onClose={() => setMode(null)}
      />
    );
  }

  return (
    <div className="flex items-center gap-2 border-t border-border p-3">
      <button
        type="button"
        onClick={() => setMode("reply")}
        className="px-3 py-1 rounded bg-primary text-primary-foreground text-sm font-medium transition-transform hover:opacity-90 active:scale-[0.96]"
      >
        {STRINGS.inbox.replyAction}
      </button>
      <button
        type="button"
        onClick={() => setMode("replyAll")}
        className="px-3 py-1 rounded border border-border text-sm text-muted-foreground transition-transform hover:bg-accent active:scale-[0.96]"
      >
        {STRINGS.inbox.replyAllAction}
      </button>
      <button
        type="button"
        onClick={() => setMode("forward")}
        className="px-3 py-1 rounded border border-border text-sm text-muted-foreground transition-transform hover:bg-accent active:scale-[0.96]"
      >
        {STRINGS.inbox.forwardAction}
      </button>
    </div>
  );
}
