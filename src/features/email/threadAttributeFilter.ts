// Client-side inbox filter over the follow-up-status + label attributes each thread already
// carries (IB1) plus the practical quick-filters attachment/unread/date-range (P2). Kept pure and
// folder-agnostic so it narrows whichever list is rendered (inbox / sent / archive / search)
// without a backend round-trip.

// Date-range presets. "any" disables the date filter; "7d"/"30d" keep threads whose last message
// falls within that many days of `now`.
export type DateRangePreset = "any" | "7d" | "30d";

export interface AttributeFilterState {
  // "" = no filter; otherwise a MAIL_FOLLOW_UP_STATUS value.
  followUp: string;
  // "" = no filter; otherwise a MAIL_LABELS value the thread must carry.
  label: string;
  // When true, keep only threads carrying an attachment.
  hasAttachment: boolean;
  // When true, keep only unread threads.
  unreadOnly: boolean;
  // Date-range preset over lastMessageAt; "any" disables it.
  dateRange: DateRangePreset;
}

export const NO_ATTRIBUTE_FILTER: AttributeFilterState = {
  followUp: "",
  label: "",
  hasAttachment: false,
  unreadOnly: false,
  dateRange: "any",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const PRESET_DAYS: Record<Exclude<DateRangePreset, "any">, number> = { "7d": 7, "30d": 30 };

// A null lastMessageAt fails any active date filter (undated threads drop out once a preset is on).
function withinRange(lastMessageAt: string | null, dateRange: DateRangePreset, now: Date): boolean {
  if (dateRange === "any") return true;
  if (lastMessageAt === null) return false;
  const cutoff = now.getTime() - PRESET_DAYS[dateRange] * DAY_MS;
  return new Date(lastMessageAt).getTime() >= cutoff;
}

export function filterByAttributes<
  T extends {
    followUpStatus: string | null;
    labels: string[];
    hasAttachment: boolean;
    unread: boolean;
    lastMessageAt: string | null;
  },
>(
  threads: T[],
  { followUp, label, hasAttachment, unreadOnly, dateRange }: AttributeFilterState,
  now: Date = new Date(),
): T[] {
  return threads.filter(
    (t) =>
      (followUp === "" || t.followUpStatus === followUp) &&
      (label === "" || t.labels.includes(label)) &&
      (!hasAttachment || t.hasAttachment) &&
      (!unreadOnly || t.unread) &&
      withinRange(t.lastMessageAt, dateRange, now),
  );
}
