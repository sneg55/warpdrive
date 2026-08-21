import type { ComposerContext } from "./composer.types";

export interface ComposerLinks {
  linkDealId: string | undefined;
  linkPersonId: string | undefined;
}

// The CRM record this compose is written against, from the three places that can name it. Live
// context wins over a resumed draft's stored link, so resuming an old draft inside a deal's
// composer repins it to that deal rather than sending against the record it was started from.
export function resolveComposerLinks(args: {
  context?: ComposerContext | undefined;
  // The inbox compose's link sidebar pick, which is deal-only and outranks the context deal.
  linkDealId?: string | undefined;
  draft?: { linkDealId?: string | null; linkPersonId?: string | null } | undefined;
}): ComposerLinks {
  const contextDealId = args.context?.kind === "deal" ? args.context.dealId : undefined;
  const contextPersonId = args.context?.kind === "deal" ? args.context.personId : undefined;
  return {
    linkDealId: args.linkDealId ?? contextDealId ?? args.draft?.linkDealId ?? undefined,
    linkPersonId: contextPersonId ?? args.draft?.linkPersonId ?? undefined,
  };
}
