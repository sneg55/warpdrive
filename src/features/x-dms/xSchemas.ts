import { z } from "zod";

const isoDate = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)))
  .transform((v) => new Date(v));

export const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().positive(),
  scope: z.string(),
});

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  username: z.string(),
  profile_image_url: z.string().nullish(),
});

export const meResponseSchema = z.object({ data: userSchema });

const includesSchema = z.object({ users: z.array(userSchema).default([]) }).optional();

const metaSchema = z.object({ next_token: z.string().nullish() }).passthrough();

export const conversationsResponseSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.string(),
        type: z.string(),
        unread: z.boolean().default(false),
        newest_event_id: z.string().nullish(),
        participant_ids: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  includes: includesSchema,
  meta: metaSchema,
});

export const eventsResponseSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.string(),
        conversation_id: z.string(),
        sender_id: z.string(),
        created_at: isoDate,
        encoded_event: z.string(),
        is_trusted: z.boolean().nullish(),
      }),
    )
    .default([]),
  includes: includesSchema,
  meta: metaSchema,
});

export const sendResponseSchema = z.object({
  data: z.object({ dm_conversation_id: z.string(), dm_event_id: z.string() }),
});

export const problemSchema = z.object({ detail: z.string().optional() }).passthrough();

export type UserWire = z.infer<typeof userSchema>;
