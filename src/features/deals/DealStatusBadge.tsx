import type React from "react";
import { Badge } from "@/components/ui/Badge";
import { DEAL_STATUS_LABELS, type DealStatus } from "@/constants/dealStatus";

export function DealStatusBadge({ status }: { status: DealStatus | undefined }): React.ReactNode {
  if (status === "won") {
    return (
      <Badge variant="success" data-deal-status="won">
        {DEAL_STATUS_LABELS.won}
      </Badge>
    );
  }
  if (status === "lost") {
    return (
      <Badge variant="destructive" data-deal-status="lost">
        {DEAL_STATUS_LABELS.lost}
      </Badge>
    );
  }
  return null;
}
