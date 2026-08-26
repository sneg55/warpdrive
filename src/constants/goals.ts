// Goal vocabulary. Kept out of the schema module so both the Zod boundary and the UI can
// import it without pulling in Drizzle.
export const GOAL_INTERVALS = ["weekly", "monthly", "quarterly", "yearly"] as const;
export type GoalInterval = (typeof GOAL_INTERVALS)[number];

export const GOAL_SUBJECTS = ["deal", "activity"] as const;
export type GoalSubject = (typeof GOAL_SUBJECTS)[number];

// Which events a goal can count. Not every action is valid for every subject; the Zod
// boundary rejects the invalid pairs (a deal is never "completed", an activity never "won").
export const GOAL_ACTIONS = ["added", "won", "lost", "completed"] as const;
export type GoalAction = (typeof GOAL_ACTIONS)[number];

export const GOAL_METRICS = ["count", "value"] as const;
export type GoalMetric = (typeof GOAL_METRICS)[number];

export const GOAL_ASSIGNEE_KINDS = ["user", "team", "company"] as const;
export type GoalAssigneeKind = (typeof GOAL_ASSIGNEE_KINDS)[number];

export const DEAL_ACTIONS: readonly GoalAction[] = ["added", "won", "lost"];
export const ACTIVITY_ACTIONS: readonly GoalAction[] = ["added", "completed"];
