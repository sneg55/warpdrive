import type { z } from "zod";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { err, ok, type Result } from "@/types/result";
import { makeBrevoHttp } from "./brevoHttp";
import { campaignListSchema, campaignStatsSchema } from "./brevoSchemas";
import type { BrevoClient, BrevoHttpConfig, CampaignPage } from "./types";

export { isTransientBrevoError } from "./brevoHttp";

function parseWith<S extends z.ZodType>(
  schema: S,
  raw: unknown,
  path: string,
): Result<z.infer<S>, AppError> {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return ok(parsed.data);
  return err(
    new AppError(ERROR_IDS.BREVO_PARSE_FAILED, "brevo response failed validation", {
      path,
      issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`),
    }),
  );
}

function toCampaignPage(raw: z.infer<typeof campaignListSchema>): CampaignPage {
  return {
    count: raw.count,
    campaigns: raw.campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      subject: c.subject ?? null,
      status: c.status,
      sentAt: c.sentDate === null ? null : new Date(c.sentDate),
    })),
  };
}

export function makeBrevoClient(cfg: BrevoHttpConfig): BrevoClient {
  const http = makeBrevoHttp(cfg);
  return {
    async listCampaigns(args, signal) {
      const path = `/emailCampaigns?limit=${args.limit}&offset=${args.offset}&excludeHtmlContent=true`;
      const raw = await http(path, signal);
      if (!raw.ok) return raw;
      if (raw.value.kind === "notFound") return ok({ campaigns: [], count: 0 });
      const parsed = parseWith(campaignListSchema, raw.value.json, path);
      return parsed.ok ? ok(toCampaignPage(parsed.value)) : parsed;
    },

    async campaignStats(email, window, signal) {
      const path = `/contacts/${encodeURIComponent(email)}/campaignStats?startDate=${window.startDate}&endDate=${window.endDate}`;
      const raw = await http(path, signal);
      if (!raw.ok) return raw;
      if (raw.value.kind === "notFound") return ok({ found: false });
      const parsed = parseWith(campaignStatsSchema, raw.value.json, path);
      return parsed.ok ? ok({ found: true, stats: parsed.value }) : parsed;
    },
  };
}
