"use client";

import { Forward, Reply, ReplyAll } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { STRINGS } from "@/constants/strings";
import { Composer } from "./Composer";
import type { ComposerContext } from "./composer/composer.types";
import { buildReplyPrefill, type ReplyMode, type ReplyPrefillSourceMessage } from "./replyPrefill";

interface ReaderActionsProps {
  message: ReplyPrefillSourceMessage;
  selfEmail: string;
  accountId: string;
  threadId: string;
  onSent?: () => void;
  initialMode?: ReplyMode;
  context?: ComposerContext;
}

export function ReaderActions({
  message,
  selfEmail,
  accountId,
  threadId,
  onSent,
  initialMode,
  context,
}: ReaderActionsProps): React.ReactNode {
  const [mode, setMode] = useState<ReplyMode | null>(initialMode ?? null);

  if (mode !== null) {
    return (
      <Composer
        accountId={accountId}
        fromAddress={selfEmail}
        threadId={mode === "forward" ? undefined : threadId}
        prefill={buildReplyPrefill(mode, message, selfEmail)}
        context={context}
        onSent={onSent}
        onClose={() => setMode(null)}
      />
    );
  }

  return (
    <div
      data-testid="reader-reply-footer"
      className="flex items-center gap-2 rounded-md border border-border bg-card p-3"
    >
      <Avatar name={message.fromEmail} className="h-7 w-7 shrink-0 text-[10px]" />
      <button
        type="button"
        onClick={() => setMode("reply")}
        className="flex items-center gap-1.5 rounded bg-action px-3 py-1 text-sm font-medium text-action-foreground transition-transform hover:opacity-90 active:scale-[0.96]"
      >
        <Reply aria-hidden="true" className="h-3.5 w-3.5" />
        {STRINGS.inbox.replyAction}
      </button>
      <button
        type="button"
        onClick={() => setMode("replyAll")}
        className="flex items-center gap-1.5 rounded border border-border px-3 py-1 text-sm text-muted-foreground transition-transform hover:bg-accent active:scale-[0.96]"
      >
        <ReplyAll aria-hidden="true" className="h-3.5 w-3.5" />
        {STRINGS.inbox.replyAllAction}
      </button>
      <button
        type="button"
        onClick={() => setMode("forward")}
        className="flex items-center gap-1.5 rounded border border-border px-3 py-1 text-sm text-muted-foreground transition-transform hover:bg-accent active:scale-[0.96]"
      >
        <Forward aria-hidden="true" className="h-3.5 w-3.5" />
        {STRINGS.inbox.forwardAction}
      </button>
    </div>
  );
}
