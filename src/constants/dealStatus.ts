export const DEAL_STATUS = ["open", "won", "lost"] as const;
export type DealStatus = (typeof DEAL_STATUS)[number];
