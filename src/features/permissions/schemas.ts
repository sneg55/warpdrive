import { z } from "zod";
import { ALL_PERMISSION_FLAG_KEYS } from "@/constants/permissionFlags";

// Validates a stored permission_sets.flags map: only known keys, boolean values,
// missing keys default false at read time (handled by the loader, not here).
const flagKey = z.enum(ALL_PERMISSION_FLAG_KEYS as unknown as [string, ...string[]]);

export const permissionFlagsSchema = z
  .record(flagKey, z.boolean())
  .transform((map) => map as Partial<Record<(typeof ALL_PERMISSION_FLAG_KEYS)[number], boolean>>);
