import type { EditableActivity } from "./ActivityEditModal";
import type { ActivityTableRow } from "./activityRows";

// Maps a table row (list projection) onto ActivityEditModal's field shape. location is projected so
// the modal prefills the saved value instead of showing a blank field. durationMinutes is not
// projected (the modal has no duration input), so it defaults to null; safe because buildActivityPatch
// only sends fields the user actually changed, so an unseen value is never clobbered. Extracted from
// ActivitiesTable to keep it under the project's file-size budget.
export function toEditableActivity(
  row: ActivityTableRow,
  typeIdByKey: Map<string, string>,
): EditableActivity {
  return {
    id: row.id,
    subject: row.subject,
    typeId: typeIdByKey.get(row.typeKey) ?? "",
    priority: row.priority,
    dueAtIso: row.dueAtIso,
    durationMinutes: null,
    location: row.location,
    done: row.done,
  };
}
