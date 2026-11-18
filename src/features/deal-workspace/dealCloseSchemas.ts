import { z } from "zod";

export const markLostInput = z.object({
  dealId: z.string().uuid(),
  lostReasonId: z.string().uuid().nullable().default(null),
  lostReason: z.string().trim().min(1).max(500).nullable().default(null),
});
