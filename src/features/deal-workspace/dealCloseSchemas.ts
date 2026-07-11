import { z } from "zod";

// Boundary schema for markLostAction. A predefined reason id, a free-text reason, or neither
// are all valid (Pipedrive parity). Free text is trimmed and length-bounded.
export const markLostInput = z.object({
  dealId: z.string().uuid(),
  lostReasonId: z.string().uuid().nullable().default(null),
  lostReason: z.string().trim().min(1).max(500).nullable().default(null),
});

export type MarkLostInput = z.infer<typeof markLostInput>;
