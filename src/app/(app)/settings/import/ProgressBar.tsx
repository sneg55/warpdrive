"use client";
import { Progress } from "@/components/ui/Progress";

export function ProgressBar({
  processed,
  total,
}: {
  processed: number;
  total: number;
}): React.ReactNode {
  const pct = total > 0 ? Math.min(Math.round((processed / total) * 100), 100) : 0;
  return (
    <div className="space-y-1">
      <Progress
        value={pct}
        label="Import progress"
        aria-valuetext={`${processed} of ${total} (${pct}%)`}
      />
      <p className="text-xs tabular-nums text-muted-foreground">
        {processed} / {total} ({pct}%)
      </p>
    </div>
  );
}
