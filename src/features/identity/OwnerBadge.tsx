import type React from "react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import { formatUserName } from "./formatUserName";

interface OwnerBadgeProps {
  name: string | null;
  avatarUrl?: string | null;
  className?: string;
}

export function OwnerBadge({ name, avatarUrl, className }: OwnerBadgeProps): React.ReactNode {
  const displayName = formatUserName(name ?? "");

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap", className)}>
      <Avatar name={displayName} src={avatarUrl} className="h-5 w-5 text-[10px]" />
      <span className="truncate">{displayName}</span>
    </span>
  );
}
