import { z } from "zod";

const eventTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "not a timestamp");

const plainEvent = z.object({ campaignId: z.number(), eventTime });

const openedEvent = z.object({
  campaignId: z.number(),
  eventTime,
  count: z.number().optional(),
  ip: z.string().optional(),
});

const clickedEvent = z.object({
  campaignId: z.number(),
  links: z.array(
    z.object({
      url: z.string(),
      eventTime,
      count: z.number().optional(),
      ip: z.string().optional(),
    }),
  ),
});

const userUnsubscription = z.object({ campaignId: z.number().nullable(), eventTime });
const adminUnsubscription = z.object({ eventTime });

const unsubscriptions = z
  .object({
    userUnsubscription: z.array(userUnsubscription).default([]),
    adminUnsubscription: z.array(adminUnsubscription).default([]),
  })
  .default({ userUnsubscription: [], adminUnsubscription: [] });

export const campaignStatsSchema = z.object({
  messagesSent: z.array(plainEvent).default([]),
  delivered: z.array(plainEvent).default([]),
  opened: z.array(openedEvent).default([]),
  clicked: z.array(clickedEvent).default([]),
  hardBounces: z.array(plainEvent).default([]),
  softBounces: z.array(plainEvent).default([]),
  complaints: z.array(plainEvent).default([]),
  unsubscriptions,
});

export type CampaignStatsRaw = z.infer<typeof campaignStatsSchema>;

export const campaignListSchema = z.object({
  campaigns: z
    .array(
      z.object({
        id: z.number(),
        name: z.string(),
        subject: z.string().nullish(),
        status: z.string(),
        sentDate: z
          .string()
          .nullish()
          .transform((s) =>
            s === undefined || s === null || Number.isNaN(Date.parse(s)) ? null : s,
          ),
      }),
    )
    .default([]),
  count: z.number().default(0),
});
