export interface MoneyBucket {
  count: number;
  value: string;
}

export interface DealPerformance {
  won: MoneyBucket;
  lost: MoneyBucket;
  open: MoneyBucket;
}

export interface FunnelStage {
  stageId: string;
  name: string;
  order: number;
  reached: number;
  conversion: number;
}

export interface ActivityPerformance {
  completed: number;
  scheduled: number;
}

export interface StageSum {
  stageId: string;
  name: string;
  dealCount: number;
  total: string;
}

// pipelineId: null means "all pipelines the user can see".
// ownerScope: 'me' restricts to the actor's own deals; 'all' requires stats.viewOthers.
// from/to: ISO date strings (YYYY-MM-DD) for the closed/created date window.
export interface DashboardFilters {
  pipelineId: string | null;
  ownerScope: "me" | "all";
  from: string;
  to: string;
}
