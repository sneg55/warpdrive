import { and, eq, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { AppError } from "@/constants/errorIds";
import type * as schema from "@/db/schema";
import type { leads } from "@/db/schema/leads";
import { organizations } from "@/db/schema/organizations";
import { persons } from "@/db/schema/persons";
import { assertReferenceVisible } from "@/features/permissions/referenceCheck";
import { ok, type Result } from "@/types/result";
import type { LeadSession } from "./leadActions";

type Db = NodePgDatabase<typeof schema>;
type LeadRow = typeof leads.$inferSelect;

// True when the referenced contact row is gone: soft-deleted, or never there at all. Deleting a
// contact does not unlink the leads that referenced it, so this state is ordinary, not corruption.
async function isDeadReference(
  db: Db,
  kind: "person" | "organization",
  id: string,
): Promise<boolean> {
  const table = kind === "person" ? persons : organizations;
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, id), isNull(table.deletedAt)));
  return row === undefined;
}

// Resolve the person/org a converted deal should carry. A hidden reference must not become a deal
// the actor could probe, exactly as createLead enforces, so it still rejects. A DELETED reference is
// a different thing that assertReferenceVisible reports identically (not-found): the lead sidebar
// already treats a deleted contact as absent (leadRepo filters deletedAt), so rejecting here left
// the lead permanently unconvertible behind a generic error. Dead references are dropped instead,
// and the deal is created without them.
export async function resolveConvertReferences(
  db: Db,
  session: LeadSession,
  lead: LeadRow,
  signal: AbortSignal,
): Promise<Result<{ personId: string | null; orgId: string | null }, AppError>> {
  let personId = lead.personId;
  let orgId = lead.orgId;

  if (personId !== null) {
    if (await isDeadReference(db, "person", personId)) {
      personId = null;
    } else {
      const ref = await assertReferenceVisible(
        db,
        session,
        { kind: "person", id: personId },
        signal,
      );
      if (!ref.ok) return ref;
    }
  }
  signal.throwIfAborted();

  if (orgId !== null) {
    if (await isDeadReference(db, "organization", orgId)) {
      orgId = null;
    } else {
      const ref = await assertReferenceVisible(
        db,
        session,
        { kind: "organization", id: orgId },
        signal,
      );
      if (!ref.ok) return ref;
    }
  }
  signal.throwIfAborted();

  return ok({ personId, orgId });
}
