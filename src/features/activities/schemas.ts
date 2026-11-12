import { z } from "zod";
import { ACTIVITY_DATE_BASES, DEFAULT_ACTIVITY_DATE_BASIS } from "@/constants/activityDateBasis";
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
    // True when the user gave a day but no time. See composeDueAt.
    allDay: z.boolean().default(false),
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
    allDay: z.boolean().optional(),
    endAt: z.string().datetime().nullable().optional(),
    durationMinutes: z.number().int().positive().nullable().optional(),
    location: z.string().trim().max(255).nullable().optional(),
    note: z.string().max(50_000).nullable().optional(),
    assigneeId: z.string().uuid().optional(),
    // Full-fidelity edit (deal-workspace inline composer): the video-call link, the guest/participant
    // sets (each replaces the whole set when provided), and re-linking the deal/person/org. Omitted
    // fields are never touched (buildPatch + the reconcilers only act on provided keys).
    videoCallUrl: z.string().url().max(2048).nullable().optional(),
    guestPersonIds: z.array(z.string().uuid()).optional(),
    participantUserIds: z.array(z.string().uuid()).optional(),
    dealId: z.string().uuid().nullable().optional(),
    personId: z.string().uuid().nullable().optional(),
    orgId: z.string().uuid().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 1, { message: "no fields to update" });

export type ActivityUpdateInput = z.input<typeof activityUpdateInput>;

// Server-driven ORDER BY for the Activities table (activities.listRows).
const ACTIVITY_SORT_FIELDS = ["subject", "dueAtIso", "priority", "duration"] as const;
export type ActivitySortField = (typeof ACTIVITY_SORT_FIELDS)[number];
export const activitySortInput = z.object({
  field: z.enum(ACTIVITY_SORT_FIELDS),
  dir: z.enum(["asc", "desc"]),
});
export type ActivitySort = z.infer<typeof activitySortInput>;

export const activityListFilter = z.object({
  ownerId: z.string().uuid().nullable().default(null),
  done: z.enum(["all", "open", "done"]).default("open"),
  from: z.string().date().nullable().default(null),
  to: z.string().date().nullable().default(null),
  dateBasis: z.enum(ACTIVITY_DATE_BASES).default(DEFAULT_ACTIVITY_DATE_BASIS),
  pipelineId: z.string().uuid().nullable().default(null),
  typeKey: z.string().nullable().default(null),
});
export type ActivityListFilter = z.infer<typeof activityListFilter>;
