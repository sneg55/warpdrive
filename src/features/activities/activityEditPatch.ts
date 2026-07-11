import { toYmd } from "@/components/ui/dateFormat";
import { composeDueAtIso } from "./activityTime";
import type { ActivityUpdateInput } from "./schemas";

// The activity fields ActivityEditModal can prefill and patch. Callers (ActivitiesTable,
// the calendar chip) map their own row/chip shape onto this; fields not tracked by the
// caller's source (durationMinutes, location) default to null, which is safe because Save
// only sends fields the user actually changed (see buildActivityPatch), never clobbering an
// unseen existing value.
export interface EditableActivity {
  id: string;
  subject: string;
  typeId: string;
  priority: string | null;
  dueAtIso: string | null;
  durationMinutes: number | null;
  location: string | null;
  done: boolean;
}

export interface EditFormState {
  subject: string;
  typeId: string;
  priority: string;
  date: string;
  time: string;
  location: string;
}

// Local Y-M-D + H:m (24h) derived from an ISO instant, using the same local wall-clock
// convention as composeDueAtIso/todayLocalDateString, so re-composing unchanged inputs
// round-trips to the exact same ISO string (no spurious dueAt diff on an untouched date).
export function isoToLocalParts(iso: string | null): { date: string; time: string } {
  if (iso === null) return { date: "", time: "" };
  const d = new Date(iso);
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return { date: toYmd(d), time };
}

// Diffs the edit form's current state against the original activity and returns only the
// changed fields (plus id), so an untouched field never overwrites existing data with an
// implicit value. Returns null when nothing changed (Save then just closes, no network call).
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
  const dueAt = composeDueAtIso(state.date, state.time);
  if (dueAt !== activity.dueAtIso) {
    patch.dueAt = dueAt;
    changed = true;
  }
  const location = state.location.trim() === "" ? null : state.location.trim();
  if (location !== activity.location) {
    patch.location = location;
    changed = true;
  }
  return changed ? patch : null;
}
