import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { AuthUser } from "@/features/permissions/types";
import { canSeeLinkedDeal, canSeeLinkedPerson } from "./emailVisibility";
import { resolveOutboundLink } from "./linking";

interface ResolvedIds {
  personId: string | null;
  dealId: string | null;
}

// Explicit composer context (visibility-checked) wins; fall back to recipient-based resolution
// for whatever the composer did not pin. Mirrors the outbound thread-link resolution.
async function resolveIds(
  db: Db,
  args: {
    owner: AuthUser;
    recipientEmail: string;
    explicitPersonId: string | null;
    explicitDealId: string | null;
  },
  signal: AbortSignal,
): Promise<ResolvedIds> {
  const okPerson =
    args.explicitPersonId !== null &&
    (await canSeeLinkedPerson(db, args.owner, args.explicitPersonId, signal));
  const okDeal =
    args.explicitDealId !== null &&
    (await canSeeLinkedDeal(db, args.owner, args.explicitDealId, signal));
  let personId = okPerson ? args.explicitPersonId : null;
  let dealId = okDeal ? args.explicitDealId : null;
  if (personId !== null && dealId !== null) return { personId, dealId };

  const outcome = await resolveOutboundLink(
    db,
    { owner: args.owner, fromEmail: args.recipientEmail, recipients: [args.recipientEmail] },
    signal,
  );
  if (outcome.kind === "linked") {
    personId ??= outcome.personId;
    dealId ??= outcome.dealId;
  }
  return { personId, dealId };
}

const put = (ctx: Record<string, string>, key: string, value: string | number | null): void => {
  if (value !== null) ctx[key] = String(value);
};

// Load {{person.*}} tokens; returns the person's org_id (or null) so the caller can resolve the org.
async function loadPerson(
  db: Db,
  personId: string,
  ctx: Record<string, string>,
  signal: AbortSignal,
): Promise<string | null> {
  const p = (
    await db.execute(
      sql`SELECT name, first_name, last_name, primary_email, org_id FROM persons WHERE id=${personId}`,
    )
  ).rows[0] as
    | {
        name: string | null;
        first_name: string | null;
        last_name: string | null;
        primary_email: string | null;
        org_id: string | null;
      }
    | undefined;
  signal.throwIfAborted();
  if (p === undefined) return null;
  put(ctx, "person.name", p.name);
  put(ctx, "person.first_name", p.first_name);
  put(ctx, "person.last_name", p.last_name);
  put(ctx, "person.email", p.primary_email);
  return p.org_id;
}

// Load {{deal.*}} tokens; returns the deal's org_id (or null).
async function loadDeal(
  db: Db,
  dealId: string,
  ctx: Record<string, string>,
  signal: AbortSignal,
): Promise<string | null> {
  const d = (await db.execute(sql`SELECT title, value, org_id FROM deals WHERE id=${dealId}`))
    .rows[0] as
    | { title: string | null; value: string | number | null; org_id: string | null }
    | undefined;
  signal.throwIfAborted();
  if (d === undefined) return null;
  put(ctx, "deal.title", d.title);
  // Postgres returns a numeric column as e.g. "25000.00"; normalize away insignificant
  // decimals so {{deal.value}} reads "25000" rather than "25000.00".
  put(ctx, "deal.value", d.value === null ? null : String(Number(d.value)));
  return d.org_id;
}

// Build the merge-field context for an outbound send: resolve the recipient's person and the
// linked deal/org, then expose their values under the {{person.*}} / {{deal.*}} / {{org.*}}
// tokens that applyMergeFields substitutes. Every id is visibility-scoped to the sender (never a
// raw client FK). Missing fields are simply absent, so applyMergeFields renders them as "" rather
// than leaking a raw {{token}} to the recipient.
export async function buildMergeContext(
  db: Db,
  args: {
    owner: AuthUser;
    recipientEmail: string;
    explicitPersonId: string | null;
    explicitDealId: string | null;
  },
  signal: AbortSignal,
): Promise<Record<string, string>> {
  signal.throwIfAborted();
  const { personId, dealId } = await resolveIds(db, args, signal);

  const ctx: Record<string, string> = {};
  const personOrg = personId !== null ? await loadPerson(db, personId, ctx, signal) : null;
  const dealOrg = dealId !== null ? await loadDeal(db, dealId, ctx, signal) : null;

  const orgId = personOrg ?? dealOrg;
  if (orgId !== null) {
    const o = (await db.execute(sql`SELECT name FROM organizations WHERE id=${orgId}`)).rows[0] as
      | { name: string | null }
      | undefined;
    signal.throwIfAborted();
    if (o?.name != null) put(ctx, "org.name", o.name);
  }

  return ctx;
}
