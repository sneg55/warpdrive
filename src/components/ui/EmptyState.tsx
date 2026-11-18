import type React from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  body,
  action,
  illustration,
  className,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
  illustration?: React.ReactNode;
  className?: string;
}): React.ReactNode {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-14 text-center",
        className,
      )}
    >
      {illustration}
      <p className="text-base font-semibold text-foreground">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}
