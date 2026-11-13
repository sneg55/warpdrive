"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { trpc } from "@/lib/trpc-client";
import type { XConversationDetail, XListView } from "../reads";
import { X_DM_STRINGS } from "../strings";
import { participantLabel } from "./XConversationRow";
import { XEncryptedPanel } from "./XEncryptedPanel";
import { XMessageList } from "./XMessageList";
import { XReplyComposer } from "./XReplyComposer";
import { xListHref } from "./xRoutes";

interface XConversationPaneProps {
  conversationId: string;
  accountId: string;
  view: XListView;
  initialData?: XConversationDetail;
}

function useConversationActions(conversationId: string, listHref: string) {
  const utils = trpc.useUtils();
  const router = useRouter();
  const reportError = useActionError();
  const refresh = (): void => {
    void utils.xDms.list.invalidate();
    void utils.xDms.conversation.invalidate({ conversationId });
    void utils.xDms.unreadCount.invalidate();
    void utils.xDms.accounts.invalidate();
  };
  const onError = (e: { message: string }): void => reportError(e.message);
  const leave = (): void => {
    refresh();
    router.push(listHref);
  };
  return {
    markRead: trpc.xDms.markRead.useMutation({ onSuccess: refresh }),
    markUnread: trpc.xDms.markUnread.useMutation({ onSuccess: refresh, onError }),
    archive: trpc.xDms.archive.useMutation({ onSuccess: leave, onError }),
    unarchive: trpc.xDms.unarchive.useMutation({ onSuccess: leave, onError }),
  };
}

export function XConversationPane({
  conversationId,
  accountId,
  view,
  initialData,
}: XConversationPaneProps): React.ReactNode {
  const listHref = xListHref(accountId, view);
  const { data } = trpc.xDms.conversation.useQuery({ conversationId }, { initialData });
  const actions = useConversationActions(conversationId, listHref);
  const markedReadFor = useRef<string | null>(null);
  const markRead = actions.markRead.mutate;

  useEffect(() => {
    if (data === undefined || markedReadFor.current === conversationId) return;
    markedReadFor.current = conversationId;
    markRead({ conversationId });
  }, [data, conversationId, markRead]);

  if (data === undefined)
    return <div className="p-4 text-sm text-muted-foreground">{X_DM_STRINGS.loading}</div>;

  const { conversation } = data;
  const messages = conversation.encrypted
    ? data.messages.filter((m) => !m.unreadable)
    : data.messages;
  const name = participantLabel(conversation);
  const folderAction = view === "archived" ? actions.unarchive : actions.archive;
  const busy = actions.archive.isPending || actions.unarchive.isPending;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-2">
        <Link
          href={listHref}
          aria-label={X_DM_STRINGS.back}
          className="rounded-md p-1 text-muted-foreground hover:bg-accent"
        >
          <ChevronLeft aria-hidden="true" className="h-4 w-4" />
        </Link>
        <Avatar name={name} src={conversation.participantAvatarUrl} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{name}</h1>
          {conversation.participantUsername !== null && (
            <p className="truncate text-xs text-muted-foreground">
              @{conversation.participantUsername}
            </p>
          )}
        </div>
        {conversation.xUnread === true && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground/70">
            {X_DM_STRINGS.unreadInX}
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={actions.markUnread.isPending}
          onClick={() => actions.markUnread.mutate({ conversationId })}
        >
          {X_DM_STRINGS.markUnread}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => folderAction.mutate({ conversationId })}
        >
          {view === "archived" ? X_DM_STRINGS.unarchive : X_DM_STRINGS.archive}
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3 p-4">
          <XMessageList messages={messages} />
          {conversation.encrypted ? (
            <XEncryptedPanel />
          ) : (
            <XReplyComposer
              conversationId={conversationId}
              participantName={conversation.participantName ?? ""}
            />
          )}
        </div>
      </div>
    </div>
  );
}
