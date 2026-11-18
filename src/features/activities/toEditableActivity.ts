import type { EditableActivity } from "./ActivityEditModal";
import type { ActivityTableRow } from "./activityRows";

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
    allDay: row.allDay,
    durationMinutes: null,
    location: row.location,
    done: row.done,
    assigneeId: row.assigneeId,
  };
}
