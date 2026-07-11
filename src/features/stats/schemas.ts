import { z } from "zod";

// Boundary validation for the dashboard procedure input.
// Query functions receive the validated/narrowed types and trust them.
export const dashboardInput = z.object({
  pipelineId: z.string().uuid().nullable().default(null),
  ownerScope: z.enum(["me", "all"]).default("me"),
  from: z.string().date(),
  to: z.string().date(),
});

export type DashboardInput = z.infer<typeof dashboardInput>;
