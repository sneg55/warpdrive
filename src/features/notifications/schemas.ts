import { z } from "zod";
import { NOTIFICATION_TYPES } from "@/constants/notificationTypes";

export const feedInput = z.object({
  limit: z.number().int().positive().max(100).default(50),
});

export const markReadInput = z.object({
  id: z.string().uuid(),
});

export const setPreferenceInput = z.object({
  type: z.enum(NOTIFICATION_TYPES),
  inApp: z.boolean(),
  email: z.boolean(),
});
