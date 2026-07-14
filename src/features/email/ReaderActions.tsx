"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
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

  // Persistent bordered footer card (PD parity B10): the sender avatar sits on the left, then the
  // reply / reply-all / forward affordances as glyph + label buttons. Boxed to match PD's reply
  // footer, in the same constrained column as the message cards above it.
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
        <ReplyGlyph />
        {STRINGS.inbox.replyAction}
      </button>
      <button
        type="button"
        onClick={() => setMode("replyAll")}
        className="flex items-center gap-1.5 rounded border border-border px-3 py-1 text-sm text-muted-foreground transition-transform hover:bg-accent active:scale-[0.96]"
      >
        <ReplyAllGlyph />
        {STRINGS.inbox.replyAllAction}
      </button>
      <button
        type="button"
        onClick={() => setMode("forward")}
        className="flex items-center gap-1.5 rounded border border-border px-3 py-1 text-sm text-muted-foreground transition-transform hover:bg-accent active:scale-[0.96]"
      >
        <ForwardGlyph />
        {STRINGS.inbox.forwardAction}
      </button>
    </div>
  );
}

// Reply / reply-all / forward glyphs (PD shows an arrow beside each affordance). Decorative: the
// button's text label supplies the accessible name, so the svg is aria-hidden.
function GlyphFrame({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function ReplyGlyph(): React.ReactNode {
  return (
    <GlyphFrame>
      <path d="M9 17l-5-5 5-5" />
      <path d="M4 12h11a5 5 0 0 1 5 5v1" />
    </GlyphFrame>
  );
}

function ReplyAllGlyph(): React.ReactNode {
  return (
    <GlyphFrame>
      <path d="M7 17l-5-5 5-5" />
      <path d="M12 17l-5-5 5-5" />
      <path d="M7 12h9a4 4 0 0 1 4 4v1" />
    </GlyphFrame>
  );
}

function ForwardGlyph(): React.ReactNode {
  return (
    <GlyphFrame>
      <path d="M15 17l5-5-5-5" />
      <path d="M20 12H9a5 5 0 0 0-5 5v1" />
    </GlyphFrame>
  );
}
