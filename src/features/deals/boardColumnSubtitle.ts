export function stageSubtitle(formattedValue: string, dealCount: number): string {
  const unit = dealCount === 1 ? "deal" : "deals";
  return `${formattedValue} · ${dealCount} ${unit}`;
}
