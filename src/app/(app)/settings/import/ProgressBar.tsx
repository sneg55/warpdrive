"use client";

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
      <div className="h-2 w-full overflow-hidden rounded bg-muted">
        <div
          className="h-full bg-primary transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs tabular-nums text-muted-foreground">
        {processed} / {total} ({pct}%)
      </p>
    </div>
  );
}
