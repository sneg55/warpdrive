import { and, eq, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type * as schema from "@/db/schema";
import { leads } from "@/db/schema/leads";
import { err, ok, type Result } from "@/types/result";
import type { LeadSession } from "./leadActions";
import { convertLead } from "./leadConvert";
import { type BulkConvertLeadsInput, bulkConvertLeadsInput } from "./schemas";
import { leadVisibilityClause } from "./visibility";

type Db = NodePgDatabase<typeof schema>;

export async function bulkConvertLeads(
  db: Db,
  session: LeadSession,
  raw: BulkConvertLeadsInput,
  signal: AbortSignal,
): Promise<Result<{ converted: number; skipped: number }, AppError>> {
  const parsed = bulkConvertLeadsInput.safeParse(raw);
  if (!parsed.success) {
    return err(
      new AppError(ERROR_IDS.LEAD_BULK_CONVERT_INPUT_INVALID, "bulkConvertLeads: invalid input"),
    );
  }
  const input = parsed.data;
  signal.throwIfAborted();

  const uniqueIds = [...new Set(input.ids)];
  let converted = 0;
  let skipped = 0;

  for (const id of uniqueIds) {
    const [lead] = await db
      .select({ updatedAt: leads.updatedAt })
      .from(leads)
      .where(and(eq(leads.id, id), isNull(leads.deletedAt), leadVisibilityClause(session)));
    signal.throwIfAborted();
    if (lead === undefined) {
      skipped += 1;
      continue;
    }

    const r = await convertLead(
      db,
      session,
      {
        leadId: id,
        pipelineId: input.pipelineId,
        expectedUpdatedAt: lead.updatedAt.toISOString(),
        customFields: input.customFields,
      },
      signal,
    );
    if (r.ok) {
      converted += 1;
      continue;
    }
    if (
      r.error.id === ERROR_IDS.LEAD_ALREADY_CONVERTED ||
      r.error.id === ERROR_IDS.LEAD_NOT_FOUND ||
      r.error.id === ERROR_IDS.CONTACT_NOT_FOUND
    ) {
      skipped += 1;
      continue;
    }
    return err(r.error);
  }

  return ok({ converted, skipped });
}
