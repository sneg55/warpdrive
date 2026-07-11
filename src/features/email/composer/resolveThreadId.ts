import type { ComposerContext } from "./composer.types";

// Resolve the thread a compose is bound to. Precedence: an explicit threadId prop, then a
// resumed draft's threadId (a reply-in-progress draft MUST keep its linkage, or sending forks a
// new thread and the next autosave writes thread_id = NULL), then an inbox context's thread.
export function resolveComposerThreadId(
  threadId: string | undefined,
  draftThreadId: string | null | undefined,
  context: ComposerContext | undefined,
): string | undefined {
  return threadId ?? draftThreadId ?? (context?.kind === "inbox" ? context.threadId : undefined);
}
