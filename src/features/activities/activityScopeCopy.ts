export const ACTIVITY_SCOPE_CHIPS_LABEL = "Applied scope";
export const ACTIVITY_PIPELINE_CHIP_FALLBACK = "Pipeline filter";
export const ACTIVITY_PIPELINE_CHIP_REMOVE = "Remove pipeline filter";
export const ACTIVITY_DONE_BASIS_CHIP = "Dates: completed";
export const ACTIVITY_DONE_BASIS_CHIP_REMOVE = "Filter dates by due date instead";

export function activityPipelineChipLabel(name: string | null): string {
  return name === null ? ACTIVITY_PIPELINE_CHIP_FALLBACK : `Pipeline: ${name}`;
}
