function toMinutes(time: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (m === null) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export interface ComposedDueAt {
  iso: string | null;
  allDay: boolean;
}

export function composeDueAt(startDate: string, startTime: string): ComposedDueAt {
  const iso = composeDueAtIso(startDate, startTime);
  return { iso, allDay: iso !== null && startTime === "" };
}

export function composeDueAtIso(startDate: string, startTime: string): string | null {
  if (startDate === "") return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate);
  if (parts === null) return null;
  const time = startTime === "" ? "00:00" : startTime;
  const d = new Date(`${startDate}T${time}`);
  if (Number.isNaN(d.getTime())) return null;
  if (
    d.getFullYear() !== Number(parts[1]) ||
    d.getMonth() + 1 !== Number(parts[2]) ||
    d.getDate() !== Number(parts[3])
  ) {
    return null;
  }
  return d.toISOString();
}

export function deriveDurationMinutes(startTime: string, endTime: string): number | null {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  if (start === null || end === null) return null;
  return end > start ? end - start : null;
}
