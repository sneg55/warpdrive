export interface MoneyBucket {
  count: number;
  value: string;
}

export interface DealCounters {
  added: MoneyBucket;
  won: MoneyBucket;
  lost: MoneyBucket;
  open: MoneyBucket;
}

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

export interface ActivityCounters {
  completed: number;
  added: number;
  scheduled: number;
  undated: number;
}

export interface ActivityTypeCount {
  typeId: string;
  key: string;
  name: string;
  completed: number;
}

export interface LostReasonCount {
  reasonId: string | null;
  name: string | null;
  count: number;
  value: string;
}

export interface StageConversionRow {
  stageId: string;
  name: string;
  order: number;
  reached: number;
  conversion: number;
  medianDaysInStage: number | null;
}

export interface WonTrendPoint {
  month: string;
  count: number;
  value: string;
}

export interface StageSum {
  stageId: string;
  name: string;
  order: number;
  dealCount: number;
  total: string;
}

export type OwnerScope =
  | { kind: "me" }
  | { kind: "all" }
  | { kind: "user"; userId: string }
  | { kind: "team"; teamId: string };

export type OwnerIdFilter = { everyone: true } | { everyone: false; ids: string[] };

export interface DashboardFilters {
  pipelineId: string | null;
  owners: OwnerIdFilter;
  from: string;
  to: string;
  timeZone: string;
}
