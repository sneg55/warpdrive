import type React from "react";
import { Badge, type BadgeProps } from "@/components/ui/Badge";
import type { DealStatus } from "@/constants/dealStatus";

const STATUS_PRESENTATION: Record<
  DealStatus,
  { label: string; variant: NonNullable<BadgeProps["variant"]> }
> = {
  open: { label: "Open", variant: "secondary" },
  won: { label: "Won", variant: "success" },
  lost: { label: "Lost", variant: "destructive" },
};

export function DealStatusBadge({ status }: { status: DealStatus }): React.ReactNode {
  const presentation = STATUS_PRESENTATION[status];
  return (
    <Badge variant={presentation.variant} aria-label={`Deal status: ${presentation.label}`}>
      {presentation.label}
    </Badge>
  );
}
