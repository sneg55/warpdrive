import { and, eq, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type * as schema from "@/db/schema";
import { leads } from "@/db/schema/leads";
import { guardWrite } from "@/server/guardWrite";
import { err, ok, type Result } from "@/types/result";
import type { LeadSession } from "./leadActions";
import { convertLead } from "./leadConvert";
import { type BulkConvertLeadsInput, bulkConvertLeadsInput } from "./schemas";
import { leadVisibilityClause } from "./visibility";

type Db = NodePgDatabase<typeof schema>;

export interface BulkConvertSummary {
  converted: number;
  skipped: number;
  failed: number;
  failureId: string | null;
}

const PER_ITEM_FAILURE_IDS: ReadonlySet<string> = new Set([
  ERROR_IDS.DB_WRITE_FAILED,
  ERROR_IDS.DB_INSERT_FAILED,
]);

export async function bulkConvertLeads(
  db: Db,
  session: LeadSession,
  raw: BulkConvertLeadsInput,
  signal: AbortSignal,
): Promise<Result<BulkConvertSummary, AppError>> {
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
  let failed = 0;
  let failureError: AppError | null = null;

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

    const r = await guardWrite("bulkConvertLeads", session.userId, () =>
      convertLead(
        db,
        session,
        {
          leadId: id,
          pipelineId: input.pipelineId,
          expectedUpdatedAt: lead.updatedAt.toISOString(),
          customFields: input.customFields,
        },
        signal,
      ),
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
    if (PER_ITEM_FAILURE_IDS.has(r.error.id)) {
      failed += 1;
      failureError ??= r.error;
      continue;
    }
    return err(r.error);
  }

  if (converted === 0 && failureError !== null) return err(failureError);
  return ok({ converted, skipped, failed, failureId: failureError?.id ?? null });
}
