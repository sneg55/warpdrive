import { z } from "zod";

export const timeZoneInput = z.string().max(64).optional();
