import { z } from "zod";
import { DEAL_STATUS } from "@/constants/dealStatus";
import { SOURCE_CHANNEL_KEYS } from "@/constants/sourceChannels";
import { labelNameArray } from "@/features/labels/labelsSchema";

const labelsArray = labelNameArray;
const labelsField = labelsArray.default([]);

export const dealCreateInput = z.object({
  title: z.string().min(1).max(255),
  value: z.number().nonnegative().multipleOf(0.01).nullable().default(null),
  pipelineId: z.string().uuid(),
  stageId: z.string().uuid(),
  personId: z.string().uuid().nullable().default(null),
  orgId: z.string().uuid().nullable().default(null),
  expectedCloseDate: z.string().date().nullable().default(null),
  labels: labelsField,
  sourceChannel: z
    .enum(SOURCE_CHANNEL_KEYS as [string, ...string[]])
    .nullable()
    .default(null),
  sourceChannelId: z.string().max(255).nullable().default(null),
  ownerId: z.string().uuid().optional(),
  visibilityGroupId: z.string().uuid().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});

export const dealUpdateInput = z.object({
  dealId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime(),
  title: z.string().min(1).max(255).optional(),
  value: z.number().nonnegative().multipleOf(0.01).nullable().optional(),
  expectedCloseDate: z.string().date().nullable().optional(),
  status: z.enum(DEAL_STATUS).optional(),
  lostReason: z.string().min(1).max(500).optional(),
  labels: labelsArray.optional(),
  sourceChannel: z
    .enum(SOURCE_CHANNEL_KEYS as [string, ...string[]])
    .nullable()
    .optional(),
  sourceChannelId: z.string().max(255).nullable().optional(),
  visibilityGroupId: z.string().uuid().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  personId: z.string().uuid().nullable().optional(),
  orgId: z.string().uuid().nullable().optional(),
});

export const dealMoveInput = z.object({
  dealId: z.string().uuid(),
  toStageId: z.string().uuid(),
  beforePosition: z.string().nullable().default(null),
  afterPosition: z.string().nullable().default(null),
  expectedUpdatedAt: z.string().datetime(),
});

export const bulkStageInput = z.object({
  dealIds: z.array(z.string().uuid()).min(1).max(500),
  toStageId: z.string().uuid(),
});

export const changeStageInput = z.object({
  dealId: z.string().uuid(),
  toStageId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime(),
});

export const changeOwnerInput = z.object({
  dealId: z.string().uuid(),
  ownerId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime(),
});

export const deleteDealInput = z.object({
  dealId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime(),
});

export type DealCreateInput = z.infer<typeof dealCreateInput>;
export type DealUpdateInput = z.infer<typeof dealUpdateInput>;
export type DealMoveInput = z.infer<typeof dealMoveInput>;
export type BulkStageInput = z.infer<typeof bulkStageInput>;
export type ChangeStageInput = z.infer<typeof changeStageInput>;
export type ChangeOwnerInput = z.infer<typeof changeOwnerInput>;
export type DeleteDealInput = z.infer<typeof deleteDealInput>;
