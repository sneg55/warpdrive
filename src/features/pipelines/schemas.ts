import { z } from "zod";

export const pipelineCreateInput = z.object({
  name: z.string().min(1).max(255),
  visibilityGroupId: z.string().uuid().nullable().default(null),
});

export const stageCreateInput = z.object({
  pipelineId: z.string().uuid(),
  name: z.string().min(1).max(255),
  rottingDays: z.number().int().positive().nullable().default(null),
});

export const stageUpdateInput = z.object({
  stageId: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  rottingDays: z.number().int().positive().nullable().optional(),
});

export const stageReorderInput = z.object({
  pipelineId: z.string().uuid(),
  orderedStageIds: z.array(z.string().uuid()).min(1),
});

export const stageDeleteInput = z.object({
  stageId: z.string().uuid(),
});

export const pipelineRenameInput = z.object({
  pipelineId: z.string().uuid(),
  name: z.string().min(1).max(255),
});

// Use z.input<> for types with .default() so callers may omit defaulted fields.
export type PipelineCreateInput = z.input<typeof pipelineCreateInput>;
export type StageCreateInput = z.input<typeof stageCreateInput>;
export type StageUpdateInput = z.infer<typeof stageUpdateInput>;
export type StageReorderInput = z.infer<typeof stageReorderInput>;
export type StageDeleteInput = z.infer<typeof stageDeleteInput>;
export type PipelineRenameInput = z.infer<typeof pipelineRenameInput>;
