import type { AppError } from "@/constants/errorIds";
import type { Result } from "@/types/result";
import type { CampaignStatsRaw } from "./brevoSchemas";
import type { DateWindow } from "./windows";

export interface BrevoCampaignInfo {
  id: number;
  name: string;
  subject: string | null;
  status: string;
  sentAt: Date | null;
}

export interface CampaignPage {
  campaigns: BrevoCampaignInfo[];
  count: number;
}

export type CampaignStatsOutcome = { found: true; stats: CampaignStatsRaw } | { found: false };

export interface BrevoClient {
  listCampaigns(
    args: { limit: number; offset: number },
    signal: AbortSignal,
  ): Promise<Result<CampaignPage, AppError>>;
  campaignStats(
    email: string,
    window: DateWindow,
    signal: AbortSignal,
  ): Promise<Result<CampaignStatsOutcome, AppError>>;
}

export interface BrevoHttpConfig {
  apiKey: string;
  baseUrl: string;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  nowMs: () => number;
  requestTimeoutMs?: number;
  requestsPerSecond?: number;
}

export type BrevoHttpOutcome = { kind: "ok"; json: unknown } | { kind: "notFound" };

export type BrevoHttp = (
  path: string,
  signal: AbortSignal,
) => Promise<Result<BrevoHttpOutcome, AppError>>;

export interface MarketingCampaignItem {
  campaignId: number;
  campaignName: string;
  subject: string | null;
  recipientEmail: string;
  recipientPersonId: string;
  at: string;
  sentAt: string | null;
  deliveredAt: string | null;
  firstOpenedAt: string | null;
  firstClickedAt: string | null;
  clickedUrls: string[];
  hardBouncedAt: string | null;
  softBouncedAt: string | null;
  complainedAt: string | null;
  unsubscribedAt: string | null;
}

export interface MarketingCampaignList {
  items: MarketingCampaignItem[];
  truncated: boolean;
}
