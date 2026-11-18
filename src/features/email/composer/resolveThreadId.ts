import type { ComposerContext } from "./composer.types";

export function resolveComposerThreadId(
  threadId: string | undefined,
  draftThreadId: string | null | undefined,
  context: ComposerContext | undefined,
): string | undefined {
  return threadId ?? draftThreadId ?? (context?.kind === "inbox" ? context.threadId : undefined);
}
