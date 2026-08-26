import type { GoalAction, GoalInterval, GoalMetric, GoalSubject } from "@/constants/goals";

const ACTION_WORD: Record<GoalAction, string> = {
  added: "added",
  won: "won",
  lost: "lost",
  completed: "completed",
};

// A goal has no name of its own; what it measures is its name. "Deal value won, monthly"
// says more than any label a user would have typed.
export function goalLabel(goal: {
  subject: GoalSubject;
  action: GoalAction;
  metric: GoalMetric;
  interval: GoalInterval;
}): string {
  const noun =
    goal.subject === "deal" ? (goal.metric === "value" ? "Deal value" : "Deals") : "Activities";
  return `${noun} ${ACTION_WORD[goal.action]}, ${goal.interval}`;
}
