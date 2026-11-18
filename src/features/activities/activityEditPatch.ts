import { toYmd } from "@/components/ui/dateFormat";
import { composeDueAt } from "./activityTime";
import type { ActivityUpdateInput } from "./schemas";

export interface EditableActivity {
  id: string;
  subject: string;
  typeId: string;
  priority: string | null;
  dueAtIso: string | null;
  allDay: boolean;
  durationMinutes: number | null;
  location: string | null;
  done: boolean;
  assigneeId?: string | null;
}

export interface EditFormState {
  subject: string;
  typeId: string;
  priority: string;
  date: string;
  time: string;
  location: string;
}

export function isoToLocalParts(
  iso: string | null,
  allDay = false,
): { date: string; time: string } {
  if (iso === null) return { date: "", time: "" };
  const d = new Date(iso);
  const time = allDay
    ? ""
    : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return { date: toYmd(d), time };
}

export function buildActivityPatch(
  activity: EditableActivity,
  state: EditFormState,
): ActivityUpdateInput | null {
  const patch: ActivityUpdateInput = { id: activity.id };
  let changed = false;

  const subject = state.subject.trim();
  if (subject !== activity.subject) {
    patch.subject = subject;
    changed = true;
  }
  if (state.typeId !== activity.typeId) {
    patch.typeId = state.typeId;
    changed = true;
  }
  const priority = state.priority === "" ? null : state.priority;
  if (priority !== activity.priority) {
    patch.priority = priority;
    changed = true;
  }
  const { iso: dueAt, allDay } = composeDueAt(state.date, state.time);
  if (dueAt !== activity.dueAtIso || allDay !== activity.allDay) {
    patch.dueAt = dueAt;
    patch.allDay = allDay;
    changed = true;
  }
  const location = state.location.trim() === "" ? null : state.location.trim();
  if (location !== activity.location) {
    patch.location = location;
    changed = true;
  }
  return changed ? patch : null;
}
