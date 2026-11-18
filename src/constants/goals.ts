export const GOAL_INTERVALS = ["weekly", "monthly", "quarterly", "yearly"] as const;
export type GoalInterval = (typeof GOAL_INTERVALS)[number];

export const GOAL_SUBJECTS = ["deal", "activity"] as const;
export type GoalSubject = (typeof GOAL_SUBJECTS)[number];

export const GOAL_ACTIONS = ["added", "won", "lost", "completed"] as const;
export type GoalAction = (typeof GOAL_ACTIONS)[number];

export const GOAL_METRICS = ["count", "value"] as const;
export type GoalMetric = (typeof GOAL_METRICS)[number];

export const GOAL_ASSIGNEE_KINDS = ["user", "team", "company"] as const;
export type GoalAssigneeKind = (typeof GOAL_ASSIGNEE_KINDS)[number];

export const DEAL_ACTIONS: readonly GoalAction[] = ["added", "won", "lost"];
export const ACTIVITY_ACTIONS: readonly GoalAction[] = ["added", "completed"];
