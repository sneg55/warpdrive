import { z } from "zod";
import { resolveTimeZone } from "@/lib/localDayRange";

export const timeZoneInput = z
  .string()
  .max(64)
  .optional()
  .transform((zone) => (zone === undefined ? undefined : resolveTimeZone(zone)));
