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
