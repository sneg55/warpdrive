import type { CalendarActivity } from "@/features/activities/calendar";

// Deep-link target for an activity: deal, then person, then org; null renders plain text.
export function linkFor(a: CalendarActivity): string | null {
  if (a.dealId !== null) return `/deals/${a.dealId}`;
  if (a.personId !== null) return `/contacts/people/${a.personId}`;
  if (a.orgId !== null) return `/contacts/orgs/${a.orgId}`;
  return null;
}

interface ActivityChipProps {
  a: CalendarActivity;
  // When provided (WeekAgendaGrid, an interactive client-rendered calendar grid), the chip
  // click opens the activity edit modal instead of only deep-linking to its parent record.
  // Omitted callers (MonthView's static read-only cells) keep today's deep-link-only behavior.
  onOpen?: (activityId: string) => void;
}

export function ActivityChip({ a, onOpen }: ActivityChipProps): React.ReactNode {
  const tone = a.overdue ? "bg-red-50 text-red-700" : "bg-gray-100 text-gray-800";
  if (onOpen !== undefined) {
    return (
      <button
        type="button"
        data-type={a.typeKey}
        onClick={() => onOpen(a.id)}
        className={`block w-full truncate rounded px-1 my-0.5 text-left text-xs hover:underline ${tone}`}
      >
        {a.subject}
      </button>
    );
  }
  const href = linkFor(a);
  return (
    <div data-type={a.typeKey} className={`text-xs rounded px-1 my-0.5 truncate ${tone}`}>
      {href !== null ? (
        <a href={href} className="hover:underline">
          {a.subject}
        </a>
      ) : (
        a.subject
      )}
    </div>
  );
}
