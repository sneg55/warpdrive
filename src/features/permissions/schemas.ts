import { z } from "zod";
import { ALL_PERMISSION_FLAG_KEYS } from "@/constants/permissionFlags";

const flagKey = z.enum(ALL_PERMISSION_FLAG_KEYS as unknown as [string, ...string[]]);

export const permissionFlagsSchema = z
  .record(flagKey, z.boolean())
  .transform((map) => map as Partial<Record<(typeof ALL_PERMISSION_FLAG_KEYS)[number], boolean>>);
