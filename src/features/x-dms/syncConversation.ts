import type { AppError } from "@/constants/errorIds";
import type { Result } from "@/types/result";
import { applyConversation } from "./applyEvents";
import { parseChatEvents } from "./eventParser";
import { type ChangedConversation, type FetchContext, fetchNewEvents } from "./fetchChanges";
import type { SyncDeps } from "./sync";
import { keyedParseOptions, type RunKeys } from "./syncKeys";

export interface RunContext {
  deps: SyncDeps;
  ctx: FetchContext;
  keys: RunKeys | null;
  firstRun: boolean;
  windowFloorMs: number;
}

export async function syncConversation(
  run: RunContext,
  item: ChangedConversation,
): Promise<Result<{ messages: number }, AppError>> {
  const { deps, ctx } = run;
  const fetched = await fetchNewEvents(ctx, {
    conversationId: item.conversation.id,
    storedNewestEventId: item.storedNewestEventId,
    floorMs: item.isNew ? run.windowFloorMs : null,
  });
  if (!fetched.ok) return fetched;
  const opts = await keyedParseOptions(
    deps,
    run.keys,
    {
      accountId: ctx.accountId,
      item,
      keyEvents: fetched.value.keyEvents,
      contextEvents: fetched.value.contextEvents,
    },
    ctx.signal,
  );
  const parsed = await parseChatEvents(fetched.value.events, opts);
  ctx.signal.throwIfAborted();
  if (parsed.failedEventIds.length > 0)
    console.warn(`x sync: ${parsed.failedEventIds.length} events did not parse`, {
      accountId: ctx.accountId,
    });
  return applyConversation(
    deps.db,
    {
      accountId: ctx.accountId,
      accountXUserId: ctx.accountXUserId,
      changed: item,
      events: fetched.value.events,
      parsed,
      firstRun: run.firstRun,
      now: new Date(deps.nowMs()),
      resetBackfill: parsed.needsKeyEventIds.length + parsed.failedEventIds.length > 0,
    },
    ctx.signal,
  );
}
