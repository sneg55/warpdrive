import { and, eq, isNull, sql } from "drizzle-orm";
import { env } from "@/config/env";
import type { Db } from "@/db/client";
import { deals, persons, pipelines } from "@/db/schema";
import { toVisibleDeal } from "@/features/deals/dealAuth";
import { canSee } from "@/features/permissions/canSee";
import type { AuthUser, VisiblePersonOrOrg } from "@/features/permissions/types";
import type { MailboxVisibility } from "./mailboxVisibility";

export type LinkOutcome =
  | { kind: "unmatched" }
  | { kind: "ambiguous_contact"; personIds: string[] }
  | { kind: "internal" }
  | { kind: "linked"; personId: string; dealId: string | null; dealCandidates: string[] };

export type ResolveLinkArgs = (
  | { owner: AuthUser; visible?: never }
  | { visible: MailboxVisibility; owner?: never }
) & {
  participants: string[];
  fromEmail: string;
};

function isInternal(addr: string): boolean {
  const domain = env.GOOGLE_WORKSPACE_DOMAIN.toLowerCase();
  return addr.trim().toLowerCase().endsWith(`@${domain}`);
}

export function toVisiblePerson(row: {
  ownerId: string | null;
  visibilityLevel: VisiblePersonOrOrg["visibilityLevel"];
  visibilityGroupId: string | null;
  visibleToUserIds: readonly string[];
}): VisiblePersonOrOrg {
  return {
    kind: "person",
    ownerId: row.ownerId,
    visibilityLevel: row.visibilityLevel,
    visibilityGroupId: row.visibilityGroupId,
    visibleToUserIds: row.visibleToUserIds,
  };
}

export async function resolveLink(
  db: Db,
  args: ResolveLinkArgs,
  signal: AbortSignal,
): Promise<LinkOutcome> {
  signal.throwIfAborted();

  const externals = args.participants.filter((a) => isInternal(a) === false);
  if (externals.length === 0) return { kind: "internal" };

  const personRows = await db
    .select()
    .from(persons)
    .where(and(sql`${persons.primaryEmail} = ${args.fromEmail}`, isNull(persons.deletedAt)));
  signal.throwIfAborted();

  const visible: MailboxVisibility = args.visible ?? ((record) => canSee(args.owner, record));
  const visiblePeople = personRows.filter((r) => visible(toVisiblePerson(r)));
  if (visiblePeople.length === 0) return { kind: "unmatched" };
  if (visiblePeople.length > 1) {
    return { kind: "ambiguous_contact", personIds: visiblePeople.map((p) => p.id) };
  }

  const matched = visiblePeople[0];
  if (matched === undefined) return { kind: "unmatched" };
  const personId = matched.id;

  const dealRows = await db
    .select({ deal: deals, pipeVg: pipelines.visibilityGroupId })
    .from(deals)
    .innerJoin(pipelines, eq(deals.pipelineId, pipelines.id))
    .where(
      and(
        eq(deals.personId, personId),
        eq(deals.status, "open"),
        isNull(deals.deletedAt),
        eq(pipelines.isArchived, false),
      ),
    )
    .orderBy(deals.createdAt);
  signal.throwIfAborted();

  const visibleDealIds = dealRows
    .filter((r) => visible(toVisibleDeal(r.deal, r.pipeVg)))
    .map((r) => r.deal.id);

  const soleDeal = visibleDealIds.length === 1 ? visibleDealIds[0] : undefined;
  if (soleDeal !== undefined) {
    return { kind: "linked", personId, dealId: soleDeal, dealCandidates: [] };
  }
  return { kind: "linked", personId, dealId: null, dealCandidates: visibleDealIds };
}

export async function resolveOutboundLink(
  db: Db,
  args: { owner: AuthUser; fromEmail: string; recipients: string[] },
  signal: AbortSignal,
): Promise<LinkOutcome> {
  signal.throwIfAborted();
  const externals = [
    ...new Set(
      args.recipients.filter((a) => isInternal(a) === false).map((a) => a.trim().toLowerCase()),
    ),
  ];
  if (externals.length !== 1) return { kind: "unmatched" };
  const recipient = externals[0];
  if (recipient === undefined) return { kind: "unmatched" };
  return resolveLink(
    db,
    { owner: args.owner, participants: [args.fromEmail, recipient], fromEmail: recipient },
    signal,
  );
}
