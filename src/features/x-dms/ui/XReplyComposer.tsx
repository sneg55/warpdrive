"use client";

import { unstable_isUnrecognizedActionError } from "next/navigation";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { ERROR_IDS } from "@/constants/errorIds";
import { trpc } from "@/lib/trpc-client";
import type { ClientError } from "@/types/actionResult";
import { readCsrfToken } from "@/utils/csrfCookie";
import { sendXReplyAction } from "../actions";
import { X_DM_STRINGS } from "../strings";
import { XTemplatePicker } from "./XTemplatePicker";

type SendFailure = { message: string; id: string };

export function appendTemplateText(current: string, inserted: string): string {
  if (current.trim() === "") return inserted;
  return `${current.trimEnd()}\n\n${inserted}`;
}

function describeRejection(e: unknown): SendFailure {
  if (unstable_isUnrecognizedActionError(e))
    return { message: X_DM_STRINGS.staleBuild, id: ERROR_IDS.UI_STALE_BUILD };
  return { message: X_DM_STRINGS.sendUnconfirmed, id: ERROR_IDS.UI_ACTION_UNCONFIRMED };
}

const FIXED_FAILURE_COPY: Partial<Record<string, string>> = {
  [ERROR_IDS.X_SENT_NOT_RECORDED]: X_DM_STRINGS.sentNotRecorded,
  [ERROR_IDS.X_SEND_UNCONFIRMED]: X_DM_STRINGS.sendMayHaveSent,
  [ERROR_IDS.X_RECONNECT_REQUIRED]: X_DM_STRINGS.reconnectRequired,
};

function failureMessage(error: ClientError): string {
  const fixed = FIXED_FAILURE_COPY[error.id];
  if (fixed !== undefined) return fixed;
  if (error.resetAtMs !== undefined)
    return X_DM_STRINGS.rateLimited(new Date(error.resetAtMs).toLocaleTimeString());
  if (error.id === ERROR_IDS.X_RATE_LIMITED) return X_DM_STRINGS.rateLimitedNoReset;
  const detail = error.detail?.trim() ?? "";
  return detail === "" ? X_DM_STRINGS.sendFailed : detail;
}

const describeFailure = (error: ClientError): SendFailure => ({
  message: failureMessage(error),
  id: error.id,
});

export function XReplyComposer({
  conversationId,
  participantName,
}: {
  conversationId: string;
  participantName: string;
}): React.ReactNode {
  const utils = trpc.useUtils();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<SendFailure | null>(null);
  const inFlight = useRef(false);
  const errorElementId = useId();
  const canSend = !sending && text.trim() !== "";

  async function send(): Promise<void> {
    if (inFlight.current || text.trim() === "") return;
    inFlight.current = true;
    setSending(true);
    setFailure(null);
    try {
      const res = await sendXReplyAction({ conversationId, text }, readCsrfToken());
      const sent = res.ok || res.error.id === ERROR_IDS.X_SENT_NOT_RECORDED;
      if (!res.ok) setFailure(describeFailure(res.error));
      if (sent) {
        setText("");
        void utils.xDms.conversation.invalidate({ conversationId });
        void utils.xDms.list.invalidate();
        void utils.xDms.unreadCount.invalidate();
        void utils.xDms.accounts.invalidate();
      }
    } catch (e) {
      console.warn("x reply action rejected without returning a Result", e);
      setFailure(describeRejection(e));
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  return (
    <div className="rounded-lg border bg-card p-2">
      <Textarea
        aria-label={X_DM_STRINGS.replyLabel}
        aria-describedby={failure === null ? undefined : errorElementId}
        placeholder={X_DM_STRINGS.replyPlaceholder}
        value={text}
        disabled={sending}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void send();
          }
        }}
        className="min-h-24 resize-y border-0 focus-visible:ring-0"
      />
      {failure !== null && (
        <p id={errorElementId} role="alert" className="px-1 pt-1 text-sm text-destructive">
          {failure.message}
          <span className="ml-1 text-xs tabular-nums">{X_DM_STRINGS.errorId(failure.id)}</span>
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <XTemplatePicker
          participantName={participantName}
          disabled={sending}
          onInsert={(inserted) => setText((current) => appendTemplateText(current, inserted))}
        />
        <Button size="sm" disabled={!canSend} aria-busy={sending} onClick={() => void send()}>
          {sending ? X_DM_STRINGS.sending : X_DM_STRINGS.send}
        </Button>
      </div>
    </div>
  );
}
