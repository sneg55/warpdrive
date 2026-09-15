import { z } from "zod";

// Boundary validation for the dashboard procedure input.
// Query functions receive the validated/narrowed types and trust them.
export const ownerScopeInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("me") }),
  z.object({ kind: z.literal("all") }),
  z.object({ kind: z.literal("user"), userId: z.string().uuid() }),
  z.object({ kind: z.literal("team"), teamId: z.string().uuid() }),
]);

export const dashboardInput = z.object({
  pipelineId: z.string().uuid().nullable().default(null),
  ownerScope: ownerScopeInput.default({ kind: "me" }),
  from: z.string().date(),
  to: z.string().date(),
});
