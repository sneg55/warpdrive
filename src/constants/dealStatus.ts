export const DEAL_STATUS = ["open", "won", "lost"] as const;
export type DealStatus = (typeof DEAL_STATUS)[number];

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  open: "Open",
  won: "Won",
  lost: "Lost",
};
