// Activity import commit authority (Wave 3 Task 12). Reuses the REAL createActivity authority
// (reference-visibility gates, deal-archived guard, reminder scheduling) rather than duplicating
// insert logic; this file only resolves the CSV's raw typeKey to a real activity_types id (or
// the "task" system type when the column was left unmapped). Activities have no natural dedup
// key, so commit.ts always creates (never updates). Imported activities are never linked to a
// deal/lead/person/org (the standard field set offers no such column), matching the brief.
import { sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { activityTypes } from "@/db/schema";
import { createActivity } from "@/features/activities/repo";
import { activityCreateInput } from "@/features/activities/schemas";
import { can } from "@/features/permissions/can";
import type { PermSetUser } from "@/features/permissions/effective";
import type { DbOrTx } from "@/server/realtime/channelVersions";
import { err, ok, type Result } from "@/types/result";
import type { RowError } from "./commitHelpers";
import { authorityError, issuesOf } from "./commitHelpers";
import { activityImportRowSchema } from "./importRowSchemas";

// Seeded system type (drizzle/0007_goofy_forge.sql); used when the CSV left typeKey unmapped.
const DEFAULT_ACTIVITY_TYPE_KEY = "task";

// Resolve a typeKey NAME to an id (case-insensitive, non-archived), defaulting to the "task"
// system type when the CSV column was left unmapped.
async function resolveTypeId(
  tx: DbOrTx,
  typeKey: string | null,
  signal: AbortSignal,
): Promise<Result<string, RowError[]>> {
  signal.throwIfAborted();
  const key = typeKey ?? DEFAULT_ACTIVITY_TYPE_KEY;
  const [type] = await tx
    .select({ id: activityTypes.id })
    .from(activityTypes)
    .where(
      sql`lower(${activityTypes.key}) = lower(${key}) and ${activityTypes.archivedAt} is null`,
    );
  if (type === undefined) {
    return err([{ field: "typeKey", message: `unknown activity type: ${key}` }]);
  }
  return ok(type.id);
}

export async function applyCreateActivity(
  tx: DbOrTx,
  actor: PermSetUser,
  mapped: Record<string, unknown>,
  signal: AbortSignal,
): Promise<Result<string, RowError[]>> {
  const parsed = activityImportRowSchema.safeParse(mapped);
  if (parsed.success === false) return err(issuesOf(parsed.error));

  // createActivity (repo) has no internal activity.create gate, unlike createDeal/createLead
  // which check their own capability flag before inserting. Import calls createActivity
  // directly (bypassing createActivityAction, the only place that gate normally lives), so
  // without this check a row-level data.import grant alone would be sufficient to create
  // activities, breaking parity with the deal/lead import paths. Per-row failure (not a thrown
  // error), so one ungated actor never aborts the rest of the batch.
  if (can(actor, "activity.create") === false) {
    return err(
      authorityError(
        new AppError(ERROR_IDS.PERM_DENIED, "activity.create capability required", {
          userId: actor.id,
        }),
      ),
    );
  }

  const typeResult = await resolveTypeId(tx, parsed.data.typeKey, signal);
  if (typeResult.ok === false) return typeResult;

  const candidate = {
    typeId: typeResult.value,
    subject: parsed.data.subject,
    dueAt: parsed.data.dueAt,
    durationMinutes: parsed.data.durationMinutes,
    customFields: parsed.data.customFields,
  };
  const finalParsed = activityCreateInput.safeParse(candidate);
  if (finalParsed.success === false) return err(issuesOf(finalParsed.error));

  const result = await createActivity(tx, actor, finalParsed.data, signal);
  if (result.ok === false) return err(authorityError(result.error));
  return ok(result.value.id);
}
