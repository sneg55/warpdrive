import { z } from "zod";
import { DEAL_STATUS } from "@/constants/dealStatus";
import { SOURCE_CHANNEL_KEYS } from "@/constants/sourceChannels";
import { labelNameArray } from "@/features/labels/labelsSchema";

// Multi-label: an array of catalog label names, deduped + capped by labelNameArray. Names are
// validated against the user-managed catalog in the UI, not by a fixed enum here. Shared by the
// create and update schemas (create defaults to [], update is optional and leaves labels
// untouched if omitted).
const labelsArray = labelNameArray;
const labelsField = labelsArray.default([]);

// CLIENT input only: visibilityLevel / visibleToUserIds are never accepted (data-model §18);
// they are trust-boundary fields derived server-side. ownerId is accepted but only HONORED when
// the actor holds deal.changeOwner (else it is ignored and the creator becomes the owner), so an
// ordinary user cannot spoof ownership.
export const dealCreateInput = z.object({
  title: z.string().min(1).max(255),
  value: z.number().nonnegative().multipleOf(0.01).nullable().default(null),
  pipelineId: z.string().uuid(),
  stageId: z.string().uuid(),
  personId: z.string().uuid().nullable().default(null),
  orgId: z.string().uuid().nullable().default(null),
  expectedCloseDate: z.string().date().nullable().default(null),
  // Multi-label: array of known label keys (deduped, capped). Unknown keys rejected here.
  labels: labelsField,
  // Source channel is a fixed enum key (resolved to a display name in the UI) or null.
  sourceChannel: z
    .enum(SOURCE_CHANNEL_KEYS as [string, ...string[]])
    .nullable()
    .default(null),
  sourceChannelId: z.string().max(255).nullable().default(null),
  // Honored only for actors with deal.changeOwner; otherwise ignored (see createDeal).
  ownerId: z.string().uuid().optional(),
  // status is intentionally NOT accepted here: a new deal is always 'open'. Closing (won/
  // lost) must go through updateDeal so wonTime/lostTime/lostReason invariants are enforced
  // (F27). Any caller-supplied status is stripped at this boundary.
  // Optional: validated server-side against the creator's group membership before use.
  visibilityGroupId: z.string().uuid().optional(),
});

export const dealUpdateInput = z.object({
  dealId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime(), // ISO datetime; compare-and-swap precondition
  title: z.string().min(1).max(255).optional(),
  value: z.number().nonnegative().multipleOf(0.01).nullable().optional(),
  expectedCloseDate: z.string().date().nullable().optional(),
  status: z.enum(DEAL_STATUS).optional(),
  lostReason: z.string().min(1).max(500).optional(),
  // Multi-label edit from the workspace sidebar: replaces the whole array when present.
  // Same dedupe + cap as create; omitted means "leave labels untouched".
  labels: labelsArray.optional(),
  // Source channel edit from the workspace sidebar: a fixed enum key or null.
  // Omitted means "leave untouched"; explicit null clears it. Same enum as create.
  sourceChannel: z
    .enum(SOURCE_CHANNEL_KEYS as [string, ...string[]])
    .nullable()
    .optional(),
  // Free-text external identifier for the source (e.g. the id in the originating system).
  // Editable from the sidebar Source section; explicit null clears it, omitted leaves untouched.
  sourceChannelId: z.string().max(255).nullable().optional(),
  // Visibility-narrowing field: changing this re-scopes a group-visibility deal to a
  // different group, stripping the old group's access. Server-side validated: updateDeal
  // rejects (E_PERM_001) unless the actor is a member of the supplied group.
  visibilityGroupId: z.string().uuid().optional(),
  // Partial custom-field edit: only the supplied keys are merged over the deal's existing
  // JSONB; omitted keys are untouched. updateDeal logs one change row per key that differs.
  customFields: z.record(z.string(), z.unknown()).optional(),
  // Primary person / organization relink. Explicit null unlinks; a uuid (re)links after a
  // reference-visibility check. Omitted means "leave untouched".
  personId: z.string().uuid().nullable().optional(),
  orgId: z.string().uuid().nullable().optional(),
});

export const dealMoveInput = z.object({
  dealId: z.string().uuid(),
  toStageId: z.string().uuid(),
  beforePosition: z.string().nullable().default(null),
  afterPosition: z.string().nullable().default(null),
  expectedUpdatedAt: z.string().datetime(), // ISO datetime; compare-and-swap precondition
});

// Bulk stage change: a set of deal ids moved to one target stage. Validated at the
// router boundary; the bulk action then applies §6.5 two-stage visibility per row.
export const bulkStageInput = z.object({
  dealIds: z.array(z.string().uuid()).min(1).max(500),
  toStageId: z.string().uuid(),
});

// Deal-header stage selector: move a deal to an explicit stage (append to the bottom
// of that column). Unlike dealMoveInput this carries no neighbor positions; the target
// board position is computed server-side.
export const changeStageInput = z.object({
  dealId: z.string().uuid(),
  toStageId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime(), // ISO datetime; compare-and-swap precondition
});

// Deal-header owner reassignment. Permission-gated by deal.changeOwner server-side.
export const changeOwnerInput = z.object({
  dealId: z.string().uuid(),
  ownerId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime(), // ISO datetime; compare-and-swap precondition
});

// Deal-header soft delete: stamps deleted_at under a CAS precondition.
export const deleteDealInput = z.object({
  dealId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime(), // ISO datetime; compare-and-swap precondition
});

export type DealCreateInput = z.infer<typeof dealCreateInput>;
export type DealUpdateInput = z.infer<typeof dealUpdateInput>;
export type DealMoveInput = z.infer<typeof dealMoveInput>;
export type BulkStageInput = z.infer<typeof bulkStageInput>;
export type ChangeStageInput = z.infer<typeof changeStageInput>;
export type ChangeOwnerInput = z.infer<typeof changeOwnerInput>;
export type DeleteDealInput = z.infer<typeof deleteDealInput>;
