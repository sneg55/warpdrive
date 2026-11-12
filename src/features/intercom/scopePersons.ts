import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { leads } from "@/db/schema";
import { toRefActor } from "@/features/contacts/actorAdapters";
import { canSeeLinkedDeal, canSeeLinkedPerson } from "@/features/email/emailVisibility";
import { leadVisibilityClause } from "@/features/leads/visibility";
import type { PermSetUser } from "@/features/permissions/effective";
import { assertNever } from "@/types/result";
import type { SupportScope } from "./supportTypes";

async function visibleOnly(
  db: Db,
  actor: PermSetUser,
  candidates: Array<string | null>,
  signal: AbortSignal,
): Promise<string[]> {
  const ids = [...new Set(candidates.filter((id): id is string => id !== null))];
  const allowed = await Promise.all(ids.map((id) => canSeeLinkedPerson(db, actor, id, signal)));
  return ids.filter((_, i) => allowed[i] === true);
}

async function dealPersonIds(db: Db, actor: PermSetUser, dealId: string, signal: AbortSignal) {
  if (!(await canSeeLinkedDeal(db, actor, dealId, signal))) return [];
  const rows = (
    await db.execute(sql`
      SELECT person_id FROM deals WHERE id = ${dealId} AND person_id IS NOT NULL
      UNION
      SELECT person_id FROM deal_participants WHERE deal_id = ${dealId}
    `)
  ).rows as Array<{ person_id: string }>;
  signal.throwIfAborted();
  return rows.map((r) => r.person_id);
}

async function leadPersonIds(db: Db, actor: PermSetUser, leadId: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const [lead] = await db
    .select({ personId: leads.personId })
    .from(leads)
    .where(
      and(eq(leads.id, leadId), isNull(leads.deletedAt), leadVisibilityClause(toRefActor(actor))),
    );
  return lead === undefined ? [] : [lead.personId];
}

export async function visiblePersonsForScope(
  db: Db,
  actor: PermSetUser,
  scope: SupportScope,
  signal: AbortSignal,
): Promise<string[]> {
  switch (scope.kind) {
    case "person":
      return visibleOnly(db, actor, [scope.personId], signal);
    case "deal":
      return visibleOnly(db, actor, await dealPersonIds(db, actor, scope.dealId, signal), signal);
    case "lead":
      return visibleOnly(db, actor, await leadPersonIds(db, actor, scope.leadId, signal), signal);
    default:
      return assertNever(scope);
  }
}
