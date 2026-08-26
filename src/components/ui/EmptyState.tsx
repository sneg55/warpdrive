import type React from "react";
import { cn } from "@/lib/utils";

// One empty state for the whole app, composed like the app's not-found page: centred, quiet,
// one sentence that says what this surface holds, and the action it just described.
// `action` is optional because some surfaces (a quota the viewer cannot set) have no honest one.
export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
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
      <p className="text-base font-semibold text-foreground">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}
