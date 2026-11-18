import { z } from "zod";
import { SOURCE_CHANNEL_KEYS } from "@/constants/sourceChannels";
import type { CustomFieldSortKey } from "@/features/custom-fields/sortKey";
import { customFieldSortKeySchema } from "@/features/custom-fields/sortKeySchema";
import { labelNameArray } from "@/features/labels/labelsSchema";
import { buildFilterSchema } from "@/schemas/filterCondition";
import { LEAD_CONDITION_CONFIG } from "./leadFilterFields";

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
  customFields: z.record(z.string(), z.unknown()).optional(),
});
export type LeadCreateInput = z.input<typeof leadCreateInput>;

export const leadArchiveInput = z.object({
  leadId: z.string().uuid(),
  archived: z.boolean().default(true),
});
export type LeadArchiveInput = z.infer<typeof leadArchiveInput>;

export const LEAD_SORT_FIELDS = [
  "title",
  "nextActivityAt",
  "createdAt",
  "ownerName",
  "value",
  "label",
  "sourceOrigin",
] as const;
export type LeadBuiltinSortField = (typeof LEAD_SORT_FIELDS)[number];
export type LeadSortField = LeadBuiltinSortField | CustomFieldSortKey;

export const LEAD_NEXT_ACTIVITY_BUCKETS = ["overdue", "today", "week", "none"] as const;
export type LeadNextActivityBucket = (typeof LEAD_NEXT_ACTIVITY_BUCKETS)[number];

const leadSortInput = z.object({
  field: z.union([z.enum(LEAD_SORT_FIELDS), customFieldSortKeySchema]).default("createdAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});

export const leadConditionInput = buildFilterSchema(LEAD_CONDITION_CONFIG);
export type LeadConditionInput = z.infer<typeof leadConditionInput>;

const leadFiltersInput = z
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
export type LeadListInput = z.input<typeof leadListInput>;
export type LeadListParsed = z.output<typeof leadListInput>;

export const leadByIdInput = z.object({ id: z.string().uuid() });

export const leadTimelineInput = z.object({ leadId: z.string().uuid() });

export const convertLeadInput = z.object({
  leadId: z.string().uuid(),
  pipelineId: z.string().uuid().optional(),
  expectedUpdatedAt: z.string().datetime(),
  customFields: z.record(z.string(), z.unknown()).default({}),
});
export type ConvertLeadInput = z.input<typeof convertLeadInput>;

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

export const bulkConvertLeadsInput = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  pipelineId: z.string().uuid().optional(),
  customFields: z.record(z.string(), z.unknown()).default({}),
});
export type BulkConvertLeadsInput = z.input<typeof bulkConvertLeadsInput>;

export const leadUpdateInput = z.object({
  leadId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime(),
  title: z.string().trim().min(1).max(255).optional(),
  value: z.number().nonnegative().multipleOf(0.01).nullable().optional(),
  ownerId: z.string().uuid().optional(),
  expectedCloseDate: z.string().date().nullable().optional(),
  labels: labelNameArray.optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});
export type LeadUpdateInput = z.infer<typeof leadUpdateInput>;
