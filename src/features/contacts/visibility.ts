import { eq } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { VisibilityLevel } from "@/constants/visibility";
import type { Db } from "@/db/client";
import { settings } from "@/db/schema";
import { err, ok, type Result } from "@/types/result";
import type { ContactActor } from "./personsRepo";

export type DerivedVisibility = {
  level: VisibilityLevel;
  visibilityGroupId: string | null;
};

// Derive visibility level and group from settings for a contact entity
// (server-side trust boundary: clients never send visibility for contacts).
// Shared by both personsRepo and orgsRepo so the two derivations cannot diverge.
export async function deriveContactVisibility(
  db: Db,
  actor: ContactActor,
  entity: "person" | "organization",
  signal: AbortSignal,
): Promise<Result<DerivedVisibility, AppError>> {
  signal.throwIfAborted();
  const [cfg] = await db.select().from(settings).where(eq(settings.id, true));
  const raw =
    entity === "person"
      ? cfg?.defaultVisibilityLevels.person
      : cfg?.defaultVisibilityLevels.organization;
  const level = (raw ?? "owner") as VisibilityLevel;

  let visibilityGroupId: string | null = null;
  if (level === "group") {
    if (actor.primaryVisibilityGroupId !== null) {
      visibilityGroupId = actor.primaryVisibilityGroupId;
    } else {
      return err(
        new AppError(
          ERROR_IDS.PERM_GROUP_REQUIRED,
          `No resolvable visibility group for group-level ${entity}`,
          { userId: actor.id },
        ),
      );
    }
  }
  return ok({ level, visibilityGroupId });
}
