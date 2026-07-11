// Activity priorities (Pipedrive Low/Medium/High). Stored on activities.priority as the key; the
// UI resolves the key to a display name and color. Keys are the trust boundary: only these are
// accepted when creating an activity.
export const ACTIVITY_PRIORITIES = {
  low: { name: "Low", color: "#64748b" },
  medium: { name: "Medium", color: "#f59e0b" },
  high: { name: "High", color: "#ef4444" },
} as const;

export type ActivityPriorityKey = keyof typeof ACTIVITY_PRIORITIES;

export const ACTIVITY_PRIORITY_KEYS = Object.keys(ACTIVITY_PRIORITIES) as ActivityPriorityKey[];

export function isActivityPriorityKey(v: string): v is ActivityPriorityKey {
  return v in ACTIVITY_PRIORITIES;
}
