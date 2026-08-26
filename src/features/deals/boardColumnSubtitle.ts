// The value/count line under a stage header. The count is always stated, including zero, so a
// filtered column reads as an answer rather than changing shape into a bare value.
export function stageSubtitle(formattedValue: string, dealCount: number): string {
  const unit = dealCount === 1 ? "deal" : "deals";
  return `${formattedValue} · ${dealCount} ${unit}`;
}
