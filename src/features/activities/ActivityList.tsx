"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type React from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import { readCsrfToken } from "@/utils/csrfCookie";
import { ActivityTypeIcon } from "./ActivityTypeIcon";
import { completeActivityAction } from "./actions";
import type { CalendarActivity } from "./calendar";
import { groupActivities } from "./groupActivities";

// Serializable row (dueAt as ISO string) so it can cross the server/client boundary.
export interface ActivityRow {
  id: string;
  subject: string;
  dueAtIso: string;
  typeKey: string;
  done: boolean;
  dealId: string | null;
  personId: string | null;
  orgId: string | null;
}

function linkFor(a: ActivityRow): string | null {
  if (a.dealId !== null) return `/deals/${a.dealId}`;
  if (a.personId !== null) return `/contacts/people/${a.personId}`;
  if (a.orgId !== null) return `/contacts/orgs/${a.orgId}`;
  return null;
}

function toCalendar(a: ActivityRow): CalendarActivity {
  return {
    id: a.id,
    subject: a.subject,
    dueAt: new Date(a.dueAtIso),
    durationMinutes: null,
    typeKey: a.typeKey,
    done: a.done,
    dealId: a.dealId,
    personId: a.personId,
    orgId: a.orgId,
    overdue: false,
    ownerName: null,
  };
}

const SECTION_LABEL: Record<"overdue" | "today" | "upcoming", string> = {
  overdue: "Overdue",
  today: "Today",
  upcoming: "Upcoming",
};

function Row({
  a,
  onDone,
}: {
  a: ActivityRow;
  onDone: (id: string, currentDone: boolean) => void;
}): React.ReactNode {
  const href = linkFor(a);
  const time = new Date(a.dueAtIso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <li className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50">
      <Checkbox
        label={`Mark "${a.subject}" done`}
        checked={a.done}
        onCheckedChange={() => onDone(a.id, a.done)}
      />
      <span className="text-muted-foreground">
        <ActivityTypeIcon typeKey={a.typeKey} />
      </span>
      <span className={a.done ? "flex-1 text-muted-foreground line-through" : "flex-1"}>
        {a.subject}
      </span>
      {href !== null && (
        <Link href={href} className="text-sm text-primary hover:underline">
          Open
        </Link>
      )}
      <time className="w-32 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
        {time}
      </time>
    </li>
  );
}

// `now` is supplied by the caller rather than read from the clock here. Reading Date.now() during
// render is impure: it makes the render depend on when it happened, so a memoized re-render (React
// Compiler, or a parent bailing out) would keep grouping against a stale clock, and a server render
// would group against a different one than hydration.
export function ActivityList({
  items,
  now,
}: {
  items: ActivityRow[];
  now: number;
}): React.ReactNode {
  const router = useRouter();
  const byId = new Map(items.map((a) => [a.id, a]));
  const grouped = groupActivities(items.map(toCalendar), now);

  function onDone(id: string, currentDone: boolean): void {
    void completeActivityAction({ id, done: !currentDone }, readCsrfToken()).then(() =>
      router.refresh(),
    );
  }

  const sections = (["overdue", "today", "upcoming"] as const)
    .map((key) => ({ key, rows: grouped[key].map((c) => byId.get(c.id)).filter(Boolean) }))
    .filter((s) => s.rows.length > 0);

  if (sections.length === 0) {
    return <p className="text-sm text-muted-foreground">No activities scheduled.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {sections.map((s) => (
        <section key={s.key} aria-label={SECTION_LABEL[s.key]}>
          <h2
            className={
              s.key === "overdue"
                ? "mb-1 text-sm font-semibold text-destructive"
                : "mb-1 text-sm font-semibold text-foreground"
            }
          >
            {SECTION_LABEL[s.key]}
          </h2>
          <ul className="divide-y overflow-hidden rounded-lg border bg-card shadow-sm">
            {s.rows.map((a) => (
              <Row key={(a as ActivityRow).id} a={a as ActivityRow} onDone={onDone} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
