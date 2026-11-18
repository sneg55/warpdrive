import type React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">): React.ReactNode {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}
