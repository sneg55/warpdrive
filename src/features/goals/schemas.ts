import { z } from "zod";
import {
  ACTIVITY_ACTIONS,
  DEAL_ACTIONS,
  GOAL_ACTIONS,
  GOAL_ASSIGNEE_KINDS,
  GOAL_INTERVALS,
  GOAL_METRICS,
  GOAL_SUBJECTS,
} from "@/constants/goals";

// Target arrives as a decimal string so it survives the round trip to numeric(14,2) without
// a float in the middle.
const target = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/)
  .refine((v) => Number(v) > 0, { message: "target must be greater than zero" });

const shape = z.object({
  subject: z.enum(GOAL_SUBJECTS),
  action: z.enum(GOAL_ACTIONS),
  metric: z.enum(GOAL_METRICS),
  assigneeKind: z.enum(GOAL_ASSIGNEE_KINDS),
  assigneeId: z.string().uuid().nullable().default(null),
  pipelineId: z.string().uuid().nullable().default(null),
  activityTypeId: z.string().uuid().nullable().default(null),
  interval: z.enum(GOAL_INTERVALS),
  target,
  startsOn: z.string().date(),
  endsOn: z.string().date().nullable().default(null),
});

// Not every combination of the enums describes a real goal, and the database cannot express
// the dependency between two columns' values. The boundary is where they are rejected.
export const goalInput = shape
  .refine((g) => (g.subject === "deal" ? DEAL_ACTIONS.includes(g.action) : true), {
    message: "a deal goal counts deals added, won or lost",
    path: ["action"],
  })
  .refine((g) => (g.subject === "activity" ? ACTIVITY_ACTIONS.includes(g.action) : true), {
    message: "an activity goal counts activities added or completed",
    path: ["action"],
  })
  // An activity carries no monetary value, so a value target on one has nothing to measure.
  .refine((g) => !(g.subject === "activity" && g.metric === "value"), {
    message: "activities have no value to total",
    path: ["metric"],
  })
  .refine((g) => !(g.subject === "deal" && g.activityTypeId !== null), {
    message: "an activity type does not narrow a deal goal",
    path: ["activityTypeId"],
  })
  .refine((g) => (g.assigneeKind === "company") === (g.assigneeId === null), {
    message: "a company goal has no assignee; a user or team goal needs one",
    path: ["assigneeId"],
  })
  // A count goal advances one whole deal or activity at a time, so a fractional target is a
  // quota that can never be met exactly.
  .refine((g) => g.metric !== "count" || Number.isInteger(Number(g.target)), {
    message: "a count target must be a whole number",
    path: ["target"],
  })
  .refine((g) => g.endsOn === null || g.endsOn >= g.startsOn, {
    message: "a goal cannot end before it starts",
    path: ["endsOn"],
  });

export type GoalInput = z.infer<typeof goalInput>;
