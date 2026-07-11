import { z } from "zod";
import { ACTIVITY_PRIORITY_KEYS } from "@/constants/activityPriorities";

export const activityCreateInput = z
  .object({
    typeId: z.string().uuid(),
    subject: z.string().min(1).max(255),
    priority: z
      .enum(ACTIVITY_PRIORITY_KEYS as [string, ...string[]])
      .nullable()
      .default(null),
    dueAt: z.string().datetime().nullable().default(null),
    // Multi-day end timestamp (Pipedrive parity). Ordering vs dueAt is enforced in the repo.
    endAt: z.string().datetime().nullable().default(null),
    durationMinutes: z.number().int().positive().nullable().default(null),
    dealId: z.string().uuid().nullable().default(null),
    // A lead-scoped activity (Leads Inbox timeline). Mutually exclusive with dealId:
    // the activities table enforces the same single-parent (deal XOR lead) check.
    leadId: z.string().uuid().nullable().default(null),
    personId: z.string().uuid().nullable().default(null),
    orgId: z.string().uuid().nullable().default(null),
    assigneeId: z.string().uuid().optional(),
    guestPersonIds: z.array(z.string().uuid()).default([]),
    participantUserIds: z.array(z.string().uuid()).default([]),
    customFields: z.record(z.string(), z.unknown()).default({}),
    note: z.string().max(50_000).nullable().default(null),
    location: z.string().trim().max(255).nullable().default(null),
    // Generated token-based video-call link (B3); a plain URL string, no external OAuth.
    videoCallUrl: z.string().url().max(2048).nullable().default(null),
    done: z.boolean().default(false),
  })
  .refine((v) => !(v.dealId !== null && v.leadId !== null), {
    message: "An activity links at most one primary parent (deal or lead, not both)",
    path: ["leadId"],
  });

// z.input so callers may omit defaulted fields (priority, dueAt, arrays); createActivity parses.
export type ActivityCreateInput = z.input<typeof activityCreateInput>;

// Partial patch for editActivityAction: every field but id is optional, and the
// refine below requires at least one field to update beyond the id.
export const activityUpdateInput = z
  .object({
    id: z.string().uuid(),
    subject: z.string().min(1).max(255).optional(),
    typeId: z.string().uuid().optional(),
    priority: z
      .enum(ACTIVITY_PRIORITY_KEYS as [string, ...string[]])
      .nullable()
      .optional(),
    dueAt: z.string().datetime().nullable().optional(),
    endAt: z.string().datetime().nullable().optional(),
    durationMinutes: z.number().int().positive().nullable().optional(),
    location: z.string().trim().max(255).nullable().optional(),
    note: z.string().max(50_000).nullable().optional(),
    assigneeId: z.string().uuid().optional(),
  })
  .refine((v) => Object.keys(v).length > 1, { message: "no fields to update" });

export type ActivityUpdateInput = z.input<typeof activityUpdateInput>;

// Server-driven ORDER BY for the Activities table (activities.listRows).
export const ACTIVITY_SORT_FIELDS = ["subject", "dueAtIso", "priority", "duration"] as const;
export type ActivitySortField = (typeof ACTIVITY_SORT_FIELDS)[number];
export const activitySortInput = z.object({
  field: z.enum(ACTIVITY_SORT_FIELDS),
  dir: z.enum(["asc", "desc"]),
});
export type ActivitySort = z.infer<typeof activitySortInput>;

// Activities-table list filter (activities.listRows). ownerId narrows by the assigned user
// (Pipedrive's Activities "Owner" filter is really the assignee, not activities.ownerId); done
// narrows open/done/all; from/to are inclusive local-day bounds on dueAt; typeKey narrows to one
// activity type. Every field defaults so an empty call still resolves ("open", unfiltered
// otherwise), matching the current default Activities-table view.
export const activityListFilter = z.object({
  ownerId: z.string().uuid().nullable().default(null),
  done: z.enum(["all", "open", "done"]).default("open"),
  from: z.string().date().nullable().default(null),
  to: z.string().date().nullable().default(null),
  typeKey: z.string().nullable().default(null),
});
export type ActivityListFilter = z.infer<typeof activityListFilter>;
