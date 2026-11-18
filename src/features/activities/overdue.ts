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
