import { assertNever } from "@/types/result";
import { type AuthUser, isMemberOfGroup, managesOwner, type VisibleRecord } from "./types";

// Pure mirror of permissions spec 2.7. Ordered, short-circuiting. Fails closed.
export function canSee(user: AuthUser, record: VisibleRecord): boolean {
  // 0. Active-user precondition, before admin bypass.
  if (!user.isActive) return false;

  // 1. Admin bypass (groups, visible_to, pipeline restriction).
  if (user.type === "admin") return true;

  // 2. Pipeline restriction (deals and deal-parented activities): hard gate, beats everything below.
  if (
    (record.kind === "deal" || record.kind === "activity") &&
    record.pipelineVisibilityGroupId !== null
  ) {
    if (!isMemberOfGroup(user, record.pipelineVisibilityGroupId)) return false;
  }

  // 3. Explicit additive allow.
  if (record.visibleToUserIds.includes(user.id)) return true;

  // 4. Ownership.
  if (record.ownerId !== null && record.ownerId === user.id) return true;

  // 4b. Team-manager view: the record is owned by a member of a team this actor manages. Sits
  // AFTER the pipeline hard gate (rule 2), so a manager never bypasses a restricted pipeline.
  // managedUserIds is populated only when the actor holds team.viewMembers.
  if (managesOwner(user, record.ownerId)) return true;

  // 5. Visibility level.
  switch (record.visibilityLevel) {
    case "all":
      return true;
    case "group":
      return isMemberOfGroup(user, record.visibilityGroupId);
    case "owner":
      return false;
    default:
      return assertNever(record.visibilityLevel);
  }
}
