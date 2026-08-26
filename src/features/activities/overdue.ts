// Whether an open activity is past due.
//
// An all-day activity stores local midnight as a placeholder for its day, so comparing that
// instant to now paints it overdue from 00:01 on the very day it is due. It is late only once
// the DAY has passed.
export function isActivityOverdue(
  dueAt: Date | null,
  allDay: boolean,
  done: boolean,
  now: number,
): boolean {
  if (done || dueAt === null) return false;
  if (!allDay) return dueAt.getTime() < now;
  const endOfDueDay = new Date(dueAt);
  endOfDueDay.setHours(23, 59, 59, 999);
  return endOfDueDay.getTime() < now;
}
