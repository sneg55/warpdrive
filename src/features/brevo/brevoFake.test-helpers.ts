import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { err, ok } from "@/types/result";
import { campaignStatsSchema } from "./brevoSchemas";
import type { BrevoCampaignInfo, BrevoClient } from "./types";
import type { DateWindow } from "./windows";

export type StatsRaw = Parameters<typeof campaignStatsSchema.parse>[0];

export type FakeEmailBehavior =
  | { kind: "stats"; stats: (window: DateWindow) => StatsRaw; failOnCall?: number }
  | { kind: "notFound" }
  | { kind: "fail"; id: (typeof ERROR_IDS)[keyof typeof ERROR_IDS] };

export interface BrevoFake {
  client: BrevoClient;
  catalog: BrevoCampaignInfo[];
  catalogFailAtOffset: number | null;
  catalogUnauthorized: boolean;
  emails: Map<string, FakeEmailBehavior>;
  statsCalls: Array<{ email: string; window: DateWindow }>;
  catalogCalls: number[];
  onStatsCall: (email: string, window: DateWindow) => void;
}

const EMPTY: StatsRaw = {};

export function makeBrevoFake(): BrevoFake {
  const fake: BrevoFake = {
    catalog: [],
    catalogFailAtOffset: null,
    catalogUnauthorized: false,
    emails: new Map(),
    statsCalls: [],
    catalogCalls: [],
    onStatsCall: () => {},
    client: {
      listCampaigns(args) {
        fake.catalogCalls.push(args.offset);
        if (fake.catalogUnauthorized) {
          return Promise.resolve(
            err(new AppError(ERROR_IDS.BREVO_UNAUTHORIZED, "unrecognised IP address", {})),
          );
        }
        if (fake.catalogFailAtOffset === args.offset) {
          return Promise.resolve(
            err(new AppError(ERROR_IDS.BREVO_HTTP_FAILED, "catalog failed", { transient: true })),
          );
        }
        const campaigns = fake.catalog.slice(args.offset, args.offset + args.limit);
        return Promise.resolve(ok({ campaigns, count: fake.catalog.length }));
      },
      campaignStats(email, window, signal) {
        fake.statsCalls.push({ email, window });
        fake.onStatsCall(email, window);
        signal.throwIfAborted();
        const behavior = fake.emails.get(email);
        const callNumber = fake.statsCalls.filter((c) => c.email === email).length;
        if (behavior?.kind === "stats" && behavior.failOnCall === callNumber) {
          return Promise.resolve(
            err(new AppError(ERROR_IDS.BREVO_NETWORK_FAILED, "window failed", {})),
          );
        }
        if (behavior === undefined || behavior.kind === "notFound") {
          return Promise.resolve(ok({ found: false as const }));
        }
        if (behavior.kind === "fail") {
          return Promise.resolve(err(new AppError(behavior.id, "email failed", {})));
        }
        return Promise.resolve(
          ok({ found: true as const, stats: campaignStatsSchema.parse(behavior.stats(window)) }),
        );
      },
    },
  };
  return fake;
}

export function emptyStats(): StatsRaw {
  return EMPTY;
}

export function campaign(id: number, sentAt: string | null = null): BrevoCampaignInfo {
  return {
    id,
    name: `Campaign ${id}`,
    subject: `Subject ${id}`,
    status: "sent",
    sentAt: sentAt === null ? null : new Date(sentAt),
  };
}
