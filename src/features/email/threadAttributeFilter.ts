export type DateRangePreset = "any" | "7d" | "30d";

export interface AttributeFilterState {
  followUp: string;
  label: string;
  hasAttachment: boolean;
  unreadOnly: boolean;
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
