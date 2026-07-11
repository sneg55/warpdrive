import { and, eq, isNull, sql } from "drizzle-orm";
import { env } from "@/config/env";
import type { Db } from "@/db/client";
import { deals, persons, pipelines } from "@/db/schema";
import { toVisibleDeal } from "@/features/deals/dealAuth";
import { canSee } from "@/features/permissions/canSee";
import type { AuthUser, VisiblePersonOrOrg } from "@/features/permissions/types";

export type LinkOutcome =
  | { kind: "unmatched" }
  | { kind: "ambiguous_contact"; personIds: string[] }
  | { kind: "internal" }
  | { kind: "linked"; personId: string; dealId: string | null; dealCandidates: string[] };

export interface ResolveLinkArgs {
  owner: AuthUser;
  participants: string[];
  fromEmail: string;
}

// A participant is internal when its address is in the workspace domain. An
// all-internal thread is never auto-linked (we do not attach internal chatter to
// a contact or deal).
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

// ops B4: resolve the contact + open deal for an inbound email. Visibility is
// always scoped to the mailbox owner via the in-memory canSee predicate (never a
// raw row spread); the deal heuristic joins pipelines so the pipeline-restriction
// hard gate runs (a deal row carries no pipelineVisibilityGroupId).
export async function resolveLink(
  db: Db,
  args: ResolveLinkArgs,
  signal: AbortSignal,
): Promise<LinkOutcome> {
  signal.throwIfAborted();

  const externals = args.participants.filter((a) => isInternal(a) === false);
  if (externals.length === 0) return { kind: "internal" };

  // Visible persons matching the sender address (citext primary_email is
  // case-insensitive; the bind param keeps it injection-safe).
  const personRows = await db
    .select()
    .from(persons)
    .where(and(sql`${persons.primaryEmail} = ${args.fromEmail}`, isNull(persons.deletedAt)));
  signal.throwIfAborted();

  const visiblePeople = personRows.filter((r) => canSee(args.owner, toVisiblePerson(r)));
  if (visiblePeople.length === 0) return { kind: "unmatched" };
  if (visiblePeople.length > 1) {
    return { kind: "ambiguous_contact", personIds: visiblePeople.map((p) => p.id) };
  }

  const matched = visiblePeople[0];
  if (matched === undefined) return { kind: "unmatched" };
  const personId = matched.id;

  // Open deals whose primary person is the matched person, visible to the owner.
  // Join pipelines so toVisibleDeal can supply pipelineVisibilityGroupId (the
  // pipeline-restriction gate would otherwise fail open).
  const dealRows = await db
    .select({ deal: deals, pipeVg: pipelines.visibilityGroupId })
    .from(deals)
    .innerJoin(pipelines, eq(deals.pipelineId, pipelines.id))
    // Never auto-link to an archived-pipeline deal: it is hidden from every read (F23).
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
    .filter((r) => canSee(args.owner, toVisibleDeal(r.deal, r.pipeVg)))
    .map((r) => r.deal.id);

  const soleDeal = visibleDealIds.length === 1 ? visibleDealIds[0] : undefined;
  if (soleDeal !== undefined) {
    return { kind: "linked", personId, dealId: soleDeal, dealCandidates: [] };
  }
  return { kind: "linked", personId, dealId: null, dealCandidates: visibleDealIds };
}

// Outbound counterpart of resolveLink. resolveLink keys the person match on the SENDER
// (fromEmail), which is correct for inbound but wrong for a message we send: there the CRM
// contact is the RECIPIENT. Match on the sole external recipient and reuse resolveLink for the
// person + open-deal heuristic. Multiple external recipients are ambiguous (which contact/deal?),
// so we leave those to explicit/manual linking rather than guessing. An all-internal recipient
// list is never auto-linked.
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
