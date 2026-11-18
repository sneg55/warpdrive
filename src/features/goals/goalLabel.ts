import type { GoalAction, GoalInterval, GoalMetric, GoalSubject } from "@/constants/goals";

const ACTION_WORD: Record<GoalAction, string> = {
  added: "added",
  won: "won",
  lost: "lost",
  completed: "completed",
};

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
