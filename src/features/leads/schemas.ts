import { z } from "zod";
import { SOURCE_CHANNEL_KEYS } from "@/constants/sourceChannels";
import { labelNameArray } from "@/features/labels/labelsSchema";
// Field/op allow-list lives in a zod-free module so the client filter builder can import it
// without pulling zod; re-exported here so existing importers of leads/schemas.ts still resolve.
import {
  LEAD_FILTER_FIELDS,
  LEAD_FILTER_OPS,
  type LeadFilterField,
  OPS_BY_LEAD_FIELD,
} from "./leadFilterFields";

export { LEAD_FILTER_FIELDS, LEAD_FILTER_OPS, type LeadFilterField, OPS_BY_LEAD_FIELD };

// CLIENT input only. visibilityLevel / visibleToUserIds are never accepted (derived server-side).
// ownerId is accepted but honored only for actors with deal.changeOwner (see createLead).
export const leadCreateInput = z.object({
  title: z.string().min(1).max(255),
  value: z.number().nonnegative().multipleOf(0.01).nullable().default(null),
  personId: z.string().uuid().nullable().default(null),
  orgId: z.string().uuid().nullable().default(null),
  expectedCloseDate: z.string().date().nullable().default(null),
  labels: labelNameArray.default([]),
  sourceChannel: z
    .enum(SOURCE_CHANNEL_KEYS as [string, ...string[]])
    .nullable()
    .default(null),
  sourceChannelId: z.string().max(255).nullable().default(null),
  sourceOrigin: z.string().max(60).default("manually_created"),
  ownerId: z.string().uuid().optional(),
  visibilityGroupId: z.string().uuid().optional(),
});
export type LeadCreateInput = z.input<typeof leadCreateInput>;

export const leadArchiveInput = z.object({
  leadId: z.string().uuid(),
  // false un-archives (returns the lead to the inbox).
  archived: z.boolean().default(true),
});
export type LeadArchiveInput = z.infer<typeof leadArchiveInput>;

// Sortable columns (server-driven ORDER BY). 'label' maps to the leads.labels array column.
export const LEAD_SORT_FIELDS = [
  "title",
  "nextActivityAt",
  "createdAt",
  "ownerName",
  "value",
  "label",
  "sourceOrigin",
] as const;
export type LeadSortField = (typeof LEAD_SORT_FIELDS)[number];

// Next-activity buckets computed server-side against next_activity_at (Pipedrive parity).
export const LEAD_NEXT_ACTIVITY_BUCKETS = ["overdue", "today", "week", "none"] as const;
export type LeadNextActivityBucket = (typeof LEAD_NEXT_ACTIVITY_BUCKETS)[number];

export const leadSortInput = z.object({
  field: z.enum(LEAD_SORT_FIELDS).default("createdAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});

// Numeric lead fields need a value that parses as a number, or the SQL numeric cast throws at query
// time and fails the whole list read. Validate that pairing at the boundary (mirrors the deal/
// contact filter schemas) so a non-UI caller cannot post `{ field: "value", value: "abc" }`.
const LEAD_NUMERIC_FIELDS: readonly LeadFilterField[] = ["value"];

const leadConditionRow = z
  .object({
    field: z.enum(LEAD_FILTER_FIELDS),
    op: z.enum(LEAD_FILTER_OPS),
    value: z.union([z.string(), z.number()]),
  })
  .superRefine((c, ctx) => {
    // Reject an operator the field's column type cannot run, so a bad pairing fails at the boundary
    // instead of throwing later in compileLeadFilter (mirrors the deal/contact filter schemas).
    if (!OPS_BY_LEAD_FIELD[c.field].includes(c.op)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `operator "${c.op}" is not valid for field "${c.field}"`,
        path: ["op"],
      });
    }
    if (LEAD_NUMERIC_FIELDS.includes(c.field) && !Number.isFinite(Number(c.value))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `field "${c.field}" needs a numeric value`,
        path: ["value"],
      });
    }
  });

export const leadConditionInput = z.object({
  combinator: z.enum(["and", "or"]),
  conditions: z.array(leadConditionRow).max(20),
});
export type LeadConditionInput = z.infer<typeof leadConditionInput>;

export const leadFiltersInput = z
  .object({
    ownerIds: z.array(z.string().uuid()).optional(),
    labelKeys: z.array(z.string()).optional(),
    nextActivity: z.enum(LEAD_NEXT_ACTIVITY_BUCKETS).optional(),
    condition: leadConditionInput.optional(),
  })
  .default({});

export const leadListInput = z.object({
  filter: z.enum(["inbox", "archived"]).default("inbox"),
  offset: z.number().int().nonnegative().default(0),
  limit: z.number().int().min(1).max(500).default(100),
  sort: leadSortInput.default({ field: "createdAt", dir: "desc" }),
  filters: leadFiltersInput,
});
// Input (pre-parse) shape: sort/filters are optional (zod fills defaults). listLeads re-parses so
// callers may pass a partial object; the router passes an already-parsed value (idempotent).
export type LeadListInput = z.input<typeof leadListInput>;
export type LeadListParsed = z.output<typeof leadListInput>;

export const leadByIdInput = z.object({ id: z.string().uuid() });
export type LeadByIdInput = z.infer<typeof leadByIdInput>;

export const leadTimelineInput = z.object({ leadId: z.string().uuid() });
export type LeadTimelineInput = z.infer<typeof leadTimelineInput>;

// Convert a lead to a deal. pipelineId optional (defaults to the org default pipeline);
// expectedUpdatedAt is the CAS token sourced from lead.updatedAt (ISO string).
export const convertLeadInput = z.object({
  leadId: z.string().uuid(),
  pipelineId: z.string().uuid().optional(),
  expectedUpdatedAt: z.string().datetime(),
  customFields: z.record(z.string(), z.unknown()).default({}),
});
export type ConvertLeadInput = z.input<typeof convertLeadInput>;

// Bulk edit over many lead ids. Exactly one change field is applied per call; invisible
// ids are silently skipped (batch semantics). ownerId/labels/archived/deleted are optional.
export const bulkUpdateLeadsInput = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  change: z
    .object({
      ownerId: z.string().uuid().optional(),
      labels: labelNameArray.optional(),
      archived: z.boolean().optional(),
      deleted: z.boolean().optional(),
    })
    .refine(
      (c) =>
        c.ownerId !== undefined ||
        c.labels !== undefined ||
        c.archived !== undefined ||
        c.deleted !== undefined,
      { message: "bulk change must set at least one field" },
    ),
});
export type BulkUpdateLeadsInput = z.infer<typeof bulkUpdateLeadsInput>;

// Bulk convert many leads to deals in one call. pipelineId optional (defaults to the org default
// pipeline, same resolution as convertLeadInput); per-id CAS lock + already-converted rejection
// happen inside convertLead, reused unchanged by bulkConvertLeads.
export const bulkConvertLeadsInput = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  pipelineId: z.string().uuid().optional(),
  customFields: z.record(z.string(), z.unknown()).default({}),
});
export type BulkConvertLeadsInput = z.input<typeof bulkConvertLeadsInput>;

// Inline-edit detail update: Title / Value / Owner / Expected close / Labels, mirroring
// dealUpdateInput. expectedUpdatedAt is the CAS token sourced from lead.updatedAt (ISO string);
// ownerId is honored only for actors holding deal.changeOwner (see updateLead). labels replaces
// the whole set (the LeadLabelRow picker commits the full list). Omitted fields are left untouched.
export const leadUpdateInput = z.object({
  leadId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime(),
  title: z.string().trim().min(1).max(255).optional(),
  value: z.number().nonnegative().multipleOf(0.01).nullable().optional(),
  ownerId: z.string().uuid().optional(),
  expectedCloseDate: z.string().date().nullable().optional(),
  labels: labelNameArray.optional(),
});
export type LeadUpdateInput = z.infer<typeof leadUpdateInput>;
