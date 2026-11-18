import type { ComposerContext } from "./composer.types";

export interface ComposerLinks {
  linkDealId: string | undefined;
  linkPersonId: string | undefined;
}

function contextPersonOf(context: ComposerContext | undefined): string | undefined {
  if (context === undefined) return undefined;
  if (context.kind === "deal") return context.personId;
  if (context.kind === "person") return context.personId;
  return undefined;
}

export function resolveComposerLinks(args: {
  context?: ComposerContext | undefined;
  linkDealId?: string | undefined;
  draft?: { linkDealId?: string | null; linkPersonId?: string | null } | undefined;
}): ComposerLinks {
  const contextDealId = args.context?.kind === "deal" ? args.context.dealId : undefined;
  const contextPersonId = contextPersonOf(args.context);
  return {
    linkDealId: args.linkDealId ?? contextDealId ?? args.draft?.linkDealId ?? undefined,
    linkPersonId: contextPersonId ?? args.draft?.linkPersonId ?? undefined,
  };
}

export function mergeRecipientEmail(to: string[], cc: string[], bcc: string[]): string {
  if (to.length + cc.length + bcc.length !== 1) return "";
  return to[0] ?? "";
}
