export interface MoneyBucket {
  count: number;
  value: string;
}

// added/won/lost each window on their own date column (created_at, won_time, lost_time).
// open is an unwindowed snapshot: an open deal has no close date to window on.
export interface DealCounters {
  added: MoneyBucket;
  won: MoneyBucket;
  lost: MoneyBucket;
  open: MoneyBucket;
}

// Every field is null over an empty set: no deals won is a different fact from an average
// of zero, and the UI renders them differently.
export interface WonDealStats {
  avgValue: string | null;
  medianValue: string | null;
  avgCycleDays: number | null;
  medianCycleDays: number | null;
}

export interface FunnelStage {
  stageId: string;
  name: string;
  order: number;
  reached: number;
  conversion: number;
}

// completed windows on done_at, added on created_at, scheduled on due_at. undated counts
// open activities with no due date, which no window can contain and which must not vanish.
export interface ActivityCounters {
  completed: number;
  added: number;
  scheduled: number;
  undated: number;
}

// A type with no completions in the range still appears, with completed = 0.
export interface ActivityTypeCount {
  typeId: string;
  key: string;
  name: string;
  completed: number;
}

// name is null only when the deal was lost with no reason at all; the UI supplies the label.
export interface LostReasonCount {
  reasonId: string | null;
  name: string | null;
  count: number;
  value: string;
}

// reached counts deals that ever got to this stage (from change-log history), not deals
// currently sitting in it. conversion is measured against the first stage.
export interface StageConversionRow {
  stageId: string;
  name: string;
  order: number;
  reached: number;
  conversion: number;
  medianDaysInStage: number | null;
}

// One month of won deals. month is YYYY-MM. Every month in the requested range gets a point,
// so a month with no wins carries a zero rather than leaving a gap in the line.
export interface WonTrendPoint {
  month: string;
  count: number;
  value: string;
}

export interface StageSum {
  stageId: string;
  name: string;
  // Position in the pipeline. Carried so the "All pipelines" view can merge stages across
  // pipelines, which share no stage ids and can only line up by position.
  order: number;
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
